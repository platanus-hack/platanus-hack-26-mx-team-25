# ZenZen — Plataforma Multimodal de Aprendizaje Socrático

## Visión General

ZenZen no es un chatbot tradicional: es un **agente pedagógico autónomo** encapsulado en una aplicación de escritorio nativa (Electron + Vue). Su núcleo cognitivo aplica estrictamente el **método socrático**: nunca entrega respuestas directas. En su lugar, descompone conceptos complejos en micro-lecciones, guía con preguntas reflexivas y se apoya en herramientas visuales generadas en tiempo real.

## Arquitectura y Características Técnicas

- **Motor gráfico reactivo (Vue + Mermaid.js):** el agente programa sus propias interfaces — genera instrucciones en tiempo real para compilar diagramas vectoriales interactivos, dibujar sobre un canvas 2D o inyectar bloques de código con resaltado sintáctico, con un sistema de cámara inteligente (auto-focus).

- **Interacción walkie-talkie (voz a voz):** transcripción de ultra-baja latencia (Whisper vía Groq) y síntesis de voz (TTS) del sistema operativo. El usuario habla presionando una tecla o mediante wake words, y el TTS se interrumpe al instante para mantener una conversación fluida.

- **Escudo anti-alucinaciones (sanitización por regex):** una capa de middleware en el frontend intercepta, sanitiza y reconstruye estructuras JSON corruptas provenientes del LLM, evitando que la interfaz colapse durante la generación de contenido complejo.

- **Memoria semántica local (RAG-lite):** persistencia local-first basada en Markdown. El agente gestiona autónomamente una "libreta de post-its" en el disco del usuario, recuperando contexto de sesiones pasadas sin saturar el límite de tokens ni comprometer la privacidad.

- **Diseño orientado a servicios (SOLID):** backend en Node.js desacoplado mediante inyección de dependencias (`StorageService`, `AgentService`, `WindowManager`), listo para escalar con nuevas tools / function calling.