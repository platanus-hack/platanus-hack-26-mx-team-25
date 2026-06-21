"use strict";
const { app, BrowserWindow, session, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config();
const CONFIG = {
  MODELS: {
    DEV: "claude-haiku-4-5-20251001",
    // Modo Ahorro ($50 USD de presupuesto)
    JUECES: "claude-sonnet-4-6"
    // Modo Pitch (Calidad pedagógica premium)
  },
  ACTIVE_MODEL: "claude-haiku-4-5-20251001",
  WINDOW: { width: 1050, height: 750 },
  PATHS: {
    RENDER_HTML: path.join(__dirname, "..", "renderer", "index.html"),
    PRELOAD_JS: path.join(__dirname, "..", "preload", "index.js"),
    // Si está empaquetada, usa la ruta segura del OS. Si no, usa tu carpeta local para que las veas en VS Code.
    NOTES_DIR: app.isPackaged ? path.join(app.getPath("userData"), "notas") : path.join(__dirname, "..", "..", "notas")
  }
};
class StorageService {
  constructor(baseDirectory) {
    this.baseDir = baseDirectory;
    this.postItsPath = path.join(this.baseDir, "postits_estado.json");
    this._ensureDirectoryExists();
  }
  _ensureDirectoryExists() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.postItsPath)) {
      fs.writeFileSync(this.postItsPath, JSON.stringify({ postits: [] }), "utf-8");
    }
  }
  /**
   * Guarda una nota larga en Markdown (Libreta física del alumno)
   */
  saveMarkdownNote(contenido) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.baseDir, `nota_${timestamp}.md`);
    fs.writeFileSync(filePath, contenido, "utf-8");
    return filePath;
  }
  /**
   * Lee los Post-its activos (Conceptos ancla de la sesión actual)
   * @returns {string[]} Arreglo de ideas clave abreviadas
   */
  getActivePostIts() {
    try {
      const data = fs.readFileSync(this.postItsPath, "utf-8");
      return JSON.parse(data).postits || [];
    } catch (e) {
      console.error("Error leyendo Post-its:", e);
      return [];
    }
  }
  /**
   * Añade o actualiza la configuración semántica de Post-its activos
   * @param {string[]} nuevosPostIts 
   */
  updatePostIts(nuevosPostIts) {
    try {
      fs.writeFileSync(this.postItsPath, JSON.stringify({ postits: nuevosPostIts }, null, 2), "utf-8");
      console.log("[Storage] Post-its semánticos actualizados localmente.");
    } catch (e) {
      console.error("Error guardando Post-its:", e);
    }
  }
}
class TutorSchemas {
  static getUIContractTool() {
    return {
      name: "actualizar_interfaz",
      description: "Actualiza la pizarra, la emoción del avatar y el TTS. Usa el formato preferido secuencia cuando haya varios pasos, o codigo_mermaid/bloque_codigo cuando sea visual o técnico.",
      input_schema: {
        type: "object",
        properties: {
          texto_a_hablar: {
            type: "string",
            description: "Respuesta socrática ultra breve (máximo 2 oraciones) para el sintetizador de voz."
          },
          avatar_estado: {
            type: "string",
            enum: ["reposo", "hablando", "pensando", "confundido", "escuchando"],
            description: "Actitud del avatar de la rana."
          },
          codigo_mermaid: {
            type: "string",
            description: "Opcional. Código válido de Mermaid.js para explicar procesos, flujos, mapas conceptuales o arquitecturas."
          },
          bloque_codigo: {
            type: "object",
            description: "Opcional. Úsalo EXCLUSIVAMENTE para mostrar fragmentos de código fuente o comandos.",
            properties: {
              lenguaje: {
                type: "string",
                description: "ej. python, javascript, csharp, bash"
              },
              codigo: {
                type: "string",
                description: "El bloque de código a mostrar, respetando la indentación."
              }
            },
            required: ["lenguaje", "codigo"]
          },
          secuencia: {
            type: "array",
            description: "Formato preferido para respuestas paso a paso. Cada paso puede incluir texto, avatar_estado y dibujo.",
            items: {
              type: "object",
              properties: {
                texto: {
                  type: "string"
                },
                avatar_estado: {
                  type: "string",
                  enum: ["reposo", "hablando", "pensando", "confundido", "escuchando"]
                },
                dibujo: {
                  type: "object",
                  properties: {
                    comando: { type: "string", enum: ["limpiar", "linea", "circulo", "rectangulo", "texto"] },
                    x: { type: "number" },
                    y: { type: "number" },
                    x2: { type: "number" },
                    y2: { type: "number" },
                    w: { type: "number" },
                    h: { type: "number" },
                    radio: { type: "number" },
                    contenido: { type: "string" },
                    color: { type: "string" }
                  },
                  required: ["comando"]
                }
              }
            }
          },
          pasos_dibujo: {
            type: "array",
            description: "Compatibilidad temporal para respuestas antiguas.",
            items: {
              type: "object",
              properties: {
                comando: { type: "string", enum: ["limpiar", "linea", "circulo", "rectangulo", "texto"] },
                x: { type: "number" },
                y: { type: "number" },
                x2: { type: "number" },
                y2: { type: "number" },
                w: { type: "number" },
                h: { type: "number" },
                radio: { type: "number" },
                contenido: { type: "string" },
                color: { type: "string" }
              },
              required: ["comando"]
            }
          }
        },
        required: ["texto_a_hablar", "avatar_estado"]
      }
    };
  }
  static getSaveNotesTool() {
    return {
      name: "guardar_apuntes",
      description: "Crea un archivo .md en el disco del usuario con un resumen de valor de la lección.",
      input_schema: {
        type: "object",
        properties: {
          contenido_markdown: {
            type: "string",
            description: "Apuntes en formato Markdown."
          }
        },
        required: ["contenido_markdown"]
      }
    };
  }
}
class AgentService {
  /** @param {StorageService} storageService */
  constructor(storageService) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.storage = storageService;
    this.chatHistory = [];
    this.MAX_HISTORY_PAIRS = 3;
  }
  _buildSystemPrompt() {
    const postItsActivos = this.storage.getActivePostIts();
    const memoriaSemantica = postItsActivos.length > 0 ? `LIBRETA DE POST-ITS ACTUAL:
${postItsActivos.map((p) => `- ${p}`).join("\n")}` : `El alumno se encuentra en un lienzo limpio. No hay post-its guardados.`;
    return `Eres Tutor IA, un profesor socrático de excelencia académica, minimalista y directo.
    
    ${memoriaSemantica}
    
    REGLAS ESTRICTAS DE RESPUESTA:
    1. Responde SIEMPRE ejecutando la herramienta 'actualizar_interfaz'.
    2. Si el usuario te da una orden explícita como "anota esto", "guarda eso", ESTÁS OBLIGADO a ejecutar TAMBIÉN la herramienta 'guardar_apuntes'.
    3. Si tú consideras que un concepto es vital para el futuro, guárdalo proactivamente.
    4. Cuando guardes un Post-it, OBLIGATORIAMENTE ponle un Tag temático entre corchetes al inicio.
    5. FORMATO PREFERIDO (CRÍTICO): Si la respuesta requiere varios pasos, usa el campo 'secuencia' para sincronizar texto + dibujo + avatar. Si la respuesta es un bloque de código, usa 'bloque_codigo'. Si la respuesta es un diagrama visual, usa 'codigo_mermaid'.
    6. CONSTRUCCIÓN INCREMENTAL DE PIZARRA (CRÍTICO): NUNCA generes un diagrama complejo de golpe. Eres un tutor dibujando en tiempo real. Vas a construir el diagrama Mermaid PASO A PASO, sumando piezas en cada turno de la conversación:
       - Turno 1: Dibuja SOLO el nodo inicial (ej. A["Navegador Cliente"]) y explícalo brevemente. OBLIGATORIAMENTE termina tu explicación preguntando "¿Queda claro este primer paso?".
       - Turno 2 (Si el alumno entiende): Genera el código Mermaid sumando la primera conexión (ej. A["Navegador"] -->|ClientHello| B["Servidor"]) y explícala.
       - Sigue este ciclo de sumar 1 o 2 nodos por turno hasta completar el tema.
       - En cada turno, usa la clase 'highlight' ÚNICAMENTE en el NUEVO nodo que acabas de agregar para enfocar la atención ahí.
    7. SINTAXIS MERMAID ROBUSTA (CRÍTICO): 
       - SIEMPRE encierra los textos de los nodos entre comillas dobles. BIEN: A["Máquina de Vapor"].
       - PROHIBIDO EL USO DE HTML: NUNCA uses etiquetas como <br/> o <b> en ninguna parte.
       - Para hacer saltos de línea dentro de un nodo, usa el carácter especial "\\n" dentro de las comillas. Ejemplo BIEN: A["Punto de quiebre\\nNoches 61 a 100"].
       - Usa las comillas dobles ÚNICAMENTE dentro de los corchetes de los nodos.
       - Los IDs de los nodos deben ser letras simples y limpias (A, B, C).
    8. LIMPIEZA DE PIZARRA (CRÍTICO): Si el usuario te pide limpiar, borrar, o reiniciar la pizarra, omite 'codigo_mermaid' y usa 'secuencia' con un paso que tenga 'dibujo' con {"comando":"limpiar"}.
    9. PREVENCIÓN DE FUGAS (CRÍTICO): El campo 'texto_a_hablar' es EXCLUSIVAMENTE para lo que dirás en voz alta. NUNCA escribas código Mermaid, llaves de JSON, ni comillas dobles escapadas dentro de este campo.
    10. MODO EDITOR DE CÓDIGO (CRÍTICO): Si el alumno te pregunta sobre programación o código fuente, NUNCA uses 'pasos_dibujo' ni 'codigo_mermaid'. Usa EXCLUSIVAMENTE el campo 'bloque_codigo'.
    11. APOYO VISUAL OBLIGATORIO (CRÍTICO): Eres un tutor visual. NUNCA dejes la pizarra vacía ni dependas solo de tu voz. Si el usuario te pide un top, una lista, un resumen o una explicación teórica abstracta, ESTÁS OBLIGADO a usar 'codigo_mermaid' para ilustrar la respuesta.
    12. COMPATIBILIDAD: Si el sistema o el modelo antiguo sigue enviando 'texto_a_hablar' o 'pasos_dibujo', puedes usar esos campos como respaldo, pero prioriza 'secuencia' y 'bloque_codigo'.
    `;
  }
  /**
   * @param {string} promptUsuario 
   * @returns {Promise<Object>} Contrato JSON verificado para el Renderer
   */
  async processUserPrompt(promptUsuario) {
    this.chatHistory.push({ role: "user", content: promptUsuario });
    const tools = [
      TutorSchemas.getUIContractTool(),
      {
        name: "guardar_apuntes",
        description: "ÚSALA OBLIGATORIAMENTE si el usuario dice 'anota esto', 'guarda esto', o para consolidar conocimiento clave.",
        input_schema: {
          type: "object",
          properties: {
            contenido_markdown: { type: "string", description: "El apunte largo en formato Markdown." },
            postits_actualizados: {
              type: "array",
              items: { type: "string" },
              description: "Arreglo con TODOS los post-its anteriores MÁS el nuevo. Cada string DEBE empezar con [Tema] - Idea. Ejemplo: '[Robótica] - Los pines I2C son SDA y SCL'."
            }
          },
          required: ["contenido_markdown", "postits_actualizados"]
        }
      }
    ];
    try {
      const response = await this.anthropic.messages.create({
        model: CONFIG.ACTIVE_MODEL,
        max_tokens: 600,
        system: this._buildSystemPrompt(),
        messages: this.chatHistory,
        // Enviamos el historial controlado
        tools,
        tool_choice: { type: "tool", name: "actualizar_interfaz" }
      });
      const uiBlock = response.content.find((b) => b.type === "tool_use" && b.name === "actualizar_interfaz");
      const notesBlock = response.content.find((b) => b.type === "tool_use" && b.name === "guardar_apuntes");
      if (notesBlock) {
        this.storage.saveMarkdownNote(notesBlock.input.contenido_markdown);
        this.storage.updatePostIts(notesBlock.input.postits_actualizados);
      }
      if (!uiBlock) throw new Error("Claude no generó el bloque 'actualizar_interfaz'.");
      this.chatHistory.push({ role: "assistant", content: JSON.stringify(uiBlock.input) });
      if (this.chatHistory.length > this.MAX_HISTORY_PAIRS * 2) {
        this.chatHistory = this.chatHistory.slice(-this.MAX_HISTORY_PAIRS * 2);
      }
      return uiBlock.input;
    } catch (error) {
      console.error("[AgentService Error]:", error);
      throw error;
    }
  }
}
class WindowManager {
  constructor(config) {
    this.config = config;
    this.win = null;
  }
  init() {
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => callback(true)
    );
    this.win = new BrowserWindow({
      width: this.config.WINDOW.width,
      height: this.config.WINDOW.height,
      webPreferences: {
        preload: this.config.PATHS.PRELOAD_JS,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
      this.win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      this.win.loadFile(this.config.PATHS.RENDER_HTML);
    }
    this.win.webContents.openDevTools();
  }
}
class AppOrchestrator {
  constructor() {
    this.storage = new StorageService(CONFIG.PATHS.NOTES_DIR);
    this.agent = new AgentService(this.storage);
    this.windowManager = new WindowManager(CONFIG);
  }
  _registerIPCCheckpoints() {
    ipcMain.handle("inicializar-tutor", async () => {
      try {
        const postits = this.storage.getActivePostIts();
        const textoSaludo = postits.length > 0 ? `¡Hola de nuevo! Veo que tenemos ${postits.length} conceptos guardados en tu libreta. ¿Continuamos repasando eso o empezamos un tema nuevo?` : `¡Hola! Soy tu Tutor IA. ¿Qué tema te gustaría aprender hoy?`;
        return {
          success: true,
          data: {
            texto_a_hablar: textoSaludo,
            avatar_estado: "reposo",
            pasos_dibujo: [
              { comando: "limpiar" },
              {
                comando: "texto",
                x: 50,
                y: 100,
                contenido: "¿Qué aprenderemos hoy?",
                color: "#4f46e5"
              }
            ]
          }
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    ipcMain.handle("chat-with-agent", async (event, promptUsuario) => {
      try {
        const uiJsonPayload = await this.agent.processUserPrompt(promptUsuario);
        return { success: true, data: uiJsonPayload };
      } catch (error) {
        console.error("[Orquestador IPC Error]:", error);
        return { success: false, error: error.message };
      }
    });
    ipcMain.handle("get-groq-key", () => {
      return process.env.GROQ_API_KEY;
    });
    ipcMain.handle("get-elevenlabs-key", () => {
      return process.env.ELEVENLABS_API_KEY;
    });
  }
  start() {
    app.whenReady().then(() => {
      this.windowManager.init();
      this._registerIPCCheckpoints();
      console.log(
        `[Orquestador Boot] Listo. Modelo en uso: ${CONFIG.ACTIVE_MODEL}`
      );
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  }
}
const tutorApp = new AppOrchestrator();
tutorApp.start();
