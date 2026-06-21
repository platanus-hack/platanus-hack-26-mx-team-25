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
    this._ensureDirectoryExists();
  }
  _ensureDirectoryExists() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }
  /**
   * @param {string} contenido - Markdown puro
   * @returns {string} Ruta absoluta del archivo generado
   */
  saveMarkdownNote(contenido) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.baseDir, `nota_${timestamp}.md`);
    fs.writeFileSync(filePath, contenido, "utf-8");
    return filePath;
  }
  /**
   * @returns {string[]} Lista de conceptos clave extraídos de notas previas
   */
  getPastTopics() {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir).filter((file) => file.endsWith(".md")).map(
      (file) => file.replace("nota_", "").replace(".md", "").split("_")[0]
    );
  }
}
class TutorSchemas {
  static getUIContractTool() {
    return {
      name: "actualizar_interfaz",
      description: "Actualiza la pizarra 2D, la emoción del avatar y el TTS. DEBE invocarse siempre para responder al alumno.",
      input_schema: {
        type: "object",
        properties: {
          texto_a_hablar: {
            type: "string",
            description: "Respuesta socrática ultra breve (máximo 2 oraciones) para el sintetizador de voz."
          },
          avatar_estado: {
            type: "string",
            enum: ["reposo", "hablando", "pensando", "confundido"],
            description: "Actitud del avatar de la rana."
          },
          pasos_dibujo: {
            type: "array",
            description: "Instrucciones secuenciales de renderizado para el Canvas 2D.",
            items: {
              type: "object",
              properties: {
                comando: {
                  type: "string",
                  enum: ["limpiar", "linea", "circulo", "rectangulo", "texto"]
                },
                x: { type: "number", description: "Origen X (0 a 700)" },
                y: { type: "number", description: "Origen Y (0 a 500)" },
                x2: {
                  type: "number",
                  description: "Destino X (Exclusivo de linea)"
                },
                y2: {
                  type: "number",
                  description: "Destino Y (Exclusivo de linea)"
                },
                w: {
                  type: "number",
                  description: "Ancho (Exclusivo de rectangulo)"
                },
                h: {
                  type: "number",
                  description: "Alto (Exclusivo de rectangulo)"
                },
                radio: {
                  type: "number",
                  description: "Radio (Exclusivo de circulo)"
                },
                contenido: {
                  type: "string",
                  description: "Texto a pintar (Exclusivo de comando texto)"
                },
                color: {
                  type: "string",
                  description: "Hexadecimal del trazo, ej: #4f46e5"
                }
              },
              required: ["comando"]
            }
          }
        },
        required: ["texto_a_hablar", "avatar_estado", "pasos_dibujo"]
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
  }
  _buildSystemPrompt() {
    const temasPasados = this.storage.getPastTopics();
    const memoriaAncla = temasPasados.length > 0 ? `El alumno ya tiene notas guardadas sobre: ${temasPasados.join(", ")}.` : `Es la primera sesión del alumno.`;
    return `Eres Tutor IA, un profesor socrático de excelencia, minimalista y directo.
    
    CONTEXTO DEL ALUMNO:
    - ${memoriaAncla}
    
    REGLAS ESTRICTAS DE RESPUESTA:
    1. Tienes estrictamente prohibido responder con texto plano. SIEMPRE debes responder ejecutando la herramienta 'actualizar_interfaz'.
    2. Explica SOLO UN micro-concepto a la vez. Al terminar de explicar, haz obligatoriamente una pregunta corta para verificar entendimiento.
    3. No saludes ni digas frases de cortesía ("¡Excelente pregunta!"). Ve directo al grano.`;
  }
  /**
   * @param {string} promptUsuario
   * @returns {Promise<Object>} Contrato JSON verificado
   */
  async processUserPrompt(promptUsuario) {
    const tools = [
      TutorSchemas.getUIContractTool(),
      TutorSchemas.getSaveNotesTool()
    ];
    const response = await this.anthropic.messages.create({
      model: CONFIG.ACTIVE_MODEL,
      max_tokens: 500,
      // Salida acotada para proteger el presupuesto
      system: this._buildSystemPrompt(),
      messages: [{ role: "user", content: promptUsuario }],
      tools,
      // Forzamos al modelo a entregar el JSON de la UI obligatoriamente:
      tool_choice: { type: "tool", name: "actualizar_interfaz" }
    });
    const uiBlock = response.content.find(
      (b) => b.type === "tool_use" && b.name === "actualizar_interfaz"
    );
    const notesBlock = response.content.find(
      (b) => b.type === "tool_use" && b.name === "guardar_apuntes"
    );
    if (notesBlock) {
      this.storage.saveMarkdownNote(notesBlock.input.contenido_markdown);
    }
    if (!uiBlock)
      throw new Error("Claude no generó el bloque 'actualizar_interfaz'.");
    return uiBlock.input;
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
        const temas = this.storage.getPastTopics();
        const textoSaludo = temas.length > 0 ? `¡Hola de nuevo! Veo que antes hemos repasado: ${temas.slice(-3).join(", ")}. ¿Qué tema exploraremos hoy?` : `¡Hola! Soy tu Tutor IA. ¿Qué tema te gustaría aprender hoy?`;
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
