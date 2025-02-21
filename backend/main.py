#!/usr/bin/env python3
import asyncio
from websockets import serve
from websocket_server import handler
import playlist_manager  # Para inicializar o cargar playlists (opcional)

async def main():
    # Cargar las playlists guardadas al iniciar (opcional)
    playlists = playlist_manager.load_all_playlists()
    print("Playlists cargadas:", playlists)

    async with serve(handler, "localhost", 8080):
        print("Servidor WebSocket iniciado en ws://localhost:8080")
        await asyncio.Future()  # Mantiene el servidor en ejecución

if __name__ == "__main__":
    asyncio.run(main()) 