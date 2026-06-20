from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Libreta Espacial IA - Backend")

# Configuración de CORS para permitir que el frontend de Next.js se comunique
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción cambiaremos esto por la URL de Vercel
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def read_health():
    return {"status": "ok", "message": "Backend de FastAPI funcionando correctamente en Vercel"}

# Aquí irás importando y conectando tus rutas de la carpeta /services después