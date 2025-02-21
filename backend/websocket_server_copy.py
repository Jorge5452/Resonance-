import json
import asyncio
import logging
from typing import Dict, List, Any
from websockets.server import WebSocketServerProtocol
from playlist_manager import save_playlist, load_all_playlists

# Configuración de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Tipos personalizados
ClientsDict = Dict[WebSocketServerProtocol, str]
Playlist = List[Dict[str, Any]]

# Variables globales con tipos
connected_clients: ClientsDict = {}
global_playlist: Playlist = []

async def broadcast(message: str, sender: WebSocketServerProtocol = None) -> None:
    """
    Envía el mensaje a todos los clientes conectados excepto al remitente.
    
    Args:
        message (str): Mensaje a enviar
        sender (WebSocketServerProtocol, optional): Cliente remitente a excluir
    """
    if connected_clients:
        await asyncio.gather(
            *(client.send(message) 
              for client in connected_clients 
              if client != sender),
            return_exceptions=True
        )

async def broadcast_active_users() -> None:
    """Envía la lista actualizada de usuarios activos a todos los clientes."""
    try:
        active_msg = json.dumps({
            "type": "active_users",
            "users": list(connected_clients.values())
        })
        await asyncio.gather(
            *(client.send(active_msg) for client in connected_clients),
            return_exceptions=True
        )
    except Exception as e:
        logger.error(f"Error al transmitir usuarios activos: {e}")

async def handler(websocket: WebSocketServerProtocol, path=None) -> None:
    """
    Manejador principal de conexiones WebSocket.
    
    Args:
        websocket (WebSocketServerProtocol): Conexión WebSocket
        path: Ruta de la conexión (no utilizada pero requerida)
    """
    global global_playlist
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                message_type = data.get("type")

                if message_type == "register":
                    await handle_register(websocket, data)
                elif message_type == "playlist_load":
                    await handle_playlist_load(websocket)
                elif message_type == "chat":
                    await handle_chat(websocket, data)
                elif message_type == "playlist_save":
                    await handle_playlist_save(data)
                elif message_type == "playlist_selected":
                    await handle_playlist_selected(websocket, data)
                elif message_type == "song_added":
                    await handle_song_added(data)
                elif message_type == "control":
                    await handle_control(websocket, data)
                elif message_type == "playlist_reorder":
                    await handle_playlist_reorder(data)
                else:
                    logger.warning(f"Tipo de mensaje desconocido: {message_type}")

            except json.JSONDecodeError:
                logger.error("Error al decodificar mensaje JSON")
                continue

    except Exception as e:
        logger.error(f"Error en la conexión WebSocket: {e}")
    finally:
        await handle_disconnect(websocket)

# Handlers específicos para cada tipo de mensaje
async def handle_register(websocket: WebSocketServerProtocol, data: dict) -> None:
    username = data["username"]
    connected_clients[websocket] = username
    join_msg = json.dumps({"type": "user_joined", "username": username})
    await broadcast(join_msg)
    await broadcast_active_users()
    await websocket.send(json.dumps({
        "type": "playlist_updated",
        "playlist": global_playlist
    }))

async def handle_playlist_load(websocket: WebSocketServerProtocol) -> None:
    playlists = load_all_playlists()
    response = json.dumps({
        "type": "loaded_playlists",
        "playlists": playlists
    })
    await websocket.send(response)

async def handle_chat(websocket: WebSocketServerProtocol, data: dict) -> None:
    username = connected_clients.get(websocket, "Desconocido")
    chat_msg = json.dumps({
        "type": "chat",
        "username": username,
        "message": data["message"]
    })
    await broadcast(chat_msg)

async def handle_playlist_save(data: dict) -> None:
    name = data["name"]
    playlist = data["playlist"]
    save_playlist(name, playlist)
    update_msg = json.dumps({
        "type": "playlist_saved",
        "name": name,
        "playlist": playlist
    })
    await broadcast(update_msg)

async def handle_playlist_selected(websocket: WebSocketServerProtocol, data: dict) -> None:
    global global_playlist
    global_playlist = data["playlist"]
    selected_msg = json.dumps({
        "type": "playlist_updated",
        "playlist": global_playlist,
        "autoPlay": True
    })
    await broadcast(selected_msg)
    await websocket.send(selected_msg)

async def handle_song_added(data: dict) -> None:
    global global_playlist
    global_playlist.append(data["song"])
    playlist_msg = json.dumps({
        "type": "playlist_updated",
        "playlist": global_playlist
    })
    await broadcast(playlist_msg)

async def handle_control(websocket: WebSocketServerProtocol, data: dict) -> None:
    await broadcast(json.dumps(data), sender=websocket)

async def handle_playlist_reorder(data: dict) -> None:
    global global_playlist
    global_playlist = data["playlist"]
    playlist_msg = json.dumps({
        "type": "playlist_updated",
        "playlist": global_playlist
    })
    await broadcast(playlist_msg)

async def handle_disconnect(websocket: WebSocketServerProtocol) -> None:
    username = connected_clients.get(websocket, "Desconocido")
    if websocket in connected_clients:
        del connected_clients[websocket]
    left_msg = json.dumps({"type": "user_left", "username": username})
    await broadcast(left_msg)
    await broadcast_active_users()