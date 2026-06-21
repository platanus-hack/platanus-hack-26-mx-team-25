/**
 * @fileoverview Capa de Orquestación (Main Process) - Tutor IA
 * @author Equipo 25 - Platanus Hack 26
 * @architecture Orientada a Servicios
 */

const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

// ============================================================================
// [CONFIG] CAPA DE CONFIGURACIÓN
// ============================================================================
const CONFIG = {
  MODELS: {
    DEV: "claude-haiku-4-5-20251001",   // Modo Ahorro ($50 USD de presupuesto)
    JUECES: "claude-sonnet-4-6",        // Modo Pitch (Calidad pedagógica premium)
  },

  ACTIVE_MODEL: "claude-haiku-4-5-20251001",
  
  WINDOW: { width: 1050, height: 750 },
  PATHS: {
    RENDER_HTML: path.join(__dirname, '..', 'renderer', 'index.html'),
    PRELOAD_JS: path.join(__dirname, 'preload.js'),
    // Si está empaquetada, usa la ruta segura del OS. Si no, usa tu carpeta local para que las veas en VS Code.
    NOTES_DIR: app.isPackaged 
      ? path.join(app.getPath('userData'), 'notas') 
      : path.join(__dirname, '..', '..', 'notas')
  }
};

// ============================================================================
// [SERVICE 1] SERVICIO DE PERSISTENCIA (SRP: Single Responsibility)
// Responsabilidad exclusiva: Leer y escribir en el sistema de archivos local.
// ============================================================================
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.baseDir, `nota_${timestamp}.md`);
    fs.writeFileSync(filePath, contenido, 'utf-8');
    return filePath;
  }

  /**
   * @returns {string[]} Lista de conceptos clave extraídos de notas previas
   */
  getPastTopics() {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('nota_', '').replace('.md', '').split('_')[0]);
  }
}

// ============================================================================
// [SCHEMA] DEFINICIÓN DE CONTRATOS (OCP: Open/Closed Principle)
// Abierto a la extensión de nuevas tools, cerrado a la modificación de las base.
// ============================================================================
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
                comando: { type: "string", enum: ["limpiar", "linea", "circulo", "rectangulo", "texto"] },
                x: { type: "number", description: "Origen X (0 a 700)" },
                y: { type: "number", description: "Origen Y (0 a 500)" },
                x2: { type: "number", description: "Destino X (Exclusivo de linea)" },
                y2: { type: "number", description: "Destino Y (Exclusivo de linea)" },
                w: { type: "number", description: "Ancho (Exclusivo de rectangulo)" },
                h: { type: "number", description: "Alto (Exclusivo de rectangulo)" },
                radio: { type: "number", description: "Radio (Exclusivo de circulo)" },
                contenido: { type: "string", description: "Texto a pintar (Exclusivo de comando texto)" },
                color: { type: "string", description: "Hexadecimal del trazo, ej: #4f46e5" }
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
          contenido_markdown: { type: "string", description: "Apuntes en formato Markdown." }
        },
        required: ["contenido_markdown"]
      }
    };
  }
}

// ============================================================================
// [SERVICE 2] SERVICIO IA (DIP: Dependency Inversion Principle)
// Depende de abstracciones (StorageService), no de implementaciones de bajo nivel.
// ============================================================================
class AgentService {
  /** @param {StorageService} storageService */
  constructor(storageService) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.storage = storageService;
  }

  _buildSystemPrompt() {
    const temasPasados = this.storage.getPastTopics();
    const memoriaAncla = temasPasados.length > 0 
      ? `El alumno ya tiene notas guardadas sobre: ${temasPasados.join(', ')}.` 
      : `Es la primera sesión del alumno.`;

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
    const tools = [TutorSchemas.getUIContractTool(), TutorSchemas.getSaveNotesTool()];

    const response = await this.anthropic.messages.create({
      model: CONFIG.ACTIVE_MODEL,
      max_tokens: 500, // Salida acotada para proteger el presupuesto
      system: this._buildSystemPrompt(),
      messages: [{ role: "user", content: promptUsuario }],
      tools: tools,
      // Forzamos al modelo a entregar el JSON de la UI obligatoriamente:
      tool_choice: { type: "tool", name: "actualizar_interfaz" }
    });

    const uiBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'actualizar_interfaz');
    const notesBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'guardar_apuntes');

    // Side-effect controlado: Si decidió generar notas, las guardamos en segundo plano
    if (notesBlock) {
      this.storage.saveMarkdownNote(notesBlock.input.contenido_markdown);
    }

    if (!uiBlock) throw new Error("Claude no generó el bloque 'actualizar_interfaz'.");
    return uiBlock.input;
  }
}

// ============================================================================
// [SERVICE 3] CONTROLADOR DE VENTANA DE ELECTRON
// ============================================================================
class WindowManager {
  constructor(config) {
    this.config = config;
    this.win = null;
  }

  init() {
    // Parche nativo para que Windows no bloquee el permiso del micrófono
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(true));

    this.win = new BrowserWindow({
      width: this.config.WINDOW.width,
      height: this.config.WINDOW.height,
      webPreferences: {
        preload: this.config.PATHS.PRELOAD_JS,
        contextIsolation: true,
        nodeIntegration: false
      },
    });

    this.win.loadFile(this.config.PATHS.RENDER_HTML);
    this.win.webContents.openDevTools(); // Consola abierta para debuggear rápido
  }
}

// ============================================================================
// [CONTROLLER] ORQUESTADOR PRINCIPAL (Punto de unión de IPCs)
// ============================================================================
class AppOrchestrator {
  constructor() {
    this.storage = new StorageService(CONFIG.PATHS.NOTES_DIR);
    this.agent = new AgentService(this.storage);
    this.windowManager = new WindowManager(CONFIG);
  }

  _registerIPCCheckpoints() {
    // 1. Checkpoint de bienvenida (Arranque limpio)
    ipcMain.handle('inicializar-tutor', async () => {
      try {
        const temas = this.storage.getPastTopics();
        const textoSaludo = temas.length > 0
          ? `¡Hola de nuevo! Veo que antes hemos repasado: ${temas.slice(-3).join(', ')}. ¿Qué tema exploraremos hoy?`
          : `¡Hola! Soy tu Tutor IA. ¿Qué tema te gustaría aprender hoy?`;

        return {
          success: true,
          data: {
            texto_a_hablar: textoSaludo,
            avatar_estado: "reposo",
            pasos_dibujo: [
              { comando: "limpiar" },
              { comando: "texto", x: 50, y: 100, contenido: "¿Qué aprenderemos hoy?", color: "#4f46e5" }
            ]
          }
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 2. Checkpoint de conversación (Interacción con Claude)
    ipcMain.handle('chat-with-agent', async (event, promptUsuario) => {
      try {
        const uiJsonPayload = await this.agent.processUserPrompt(promptUsuario);
        return { success: true, data: uiJsonPayload };
      } catch (error) {
        console.error("[Orquestador IPC Error]:", error);
        return { success: false, error: error.message };
      }
    });

    // 3. [TU CÓDIGO AÑADIDO] Checkpoint para el motor de voz (Groq)
    ipcMain.handle('get-groq-key', () => {
      // Asegúrate de que process.env.GROQ_API_KEY esté definido arriba en su archivo
      return process.env.GROQ_API_KEY; 
    });
  }

  start() {
    app.whenReady().then(() => {
      this.windowManager.init();
      this._registerIPCCheckpoints();
      console.log(`[Orquestador Boot] Listo. Modelo en uso: ${CONFIG.ACTIVE_MODEL}`);
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }
}

// ============================================================================
// BOOTSTRAP DE LA APLICACIÓN
// ============================================================================
const tutorApp = new AppOrchestrator();
tutorApp.start();