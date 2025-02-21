import json
import asyncio
from playlist_manager import save_playlist, load_all_playlists

# Diccionario para almacenar los clientes conectados: {websocket: username}
connected_clients = {}

# Global variable for live playlist synchronization
globalPlaylist = []

async def broadcast(message, sender=None):
    """Envía el mensaje a todos los clientes conectados."""
    if connected_clients:
        await asyncio.gather(*(client.send(message) for client in connected_clients if client != sender))

async def broadcast_active_users():
    """Envía la lista de usuarios activos a todos los clientes."""
    active_msg = json.dumps({"type": "active_users", "users": list(connected_clients.values())})
    await asyncio.gather(*(client.send(active_msg) for client in connected_clients))

async def handler(websocket, path=None):
    global globalPlaylist  # Se declara al inicio para usar la variable global en toda la función
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "register":
                # Registro inicial del usuario
                username = data["username"]
                connected_clients[websocket] = username
                join_msg = json.dumps({"type": "user_joined", "username": username})
                await broadcast(join_msg)
                await broadcast_active_users()
                # Enviar el playlist en vivo actual al usuario que se conecta
                await websocket.send(json.dumps({"type": "playlist_updated", "playlist": globalPlaylist}))
            elif data["type"] == "playlist_load":
                # Envía las playlists guardadas al cliente que solicita la carga
                playlists = load_all_playlists()
                response = json.dumps({ "type": "loaded_playlists", "playlists": playlists })
                await websocket.send(response)
            elif data["type"] == "chat":
                # Difunde un mensaje de chat a todos
                username = connected_clients.get(websocket, "Desconocido")
                chat_msg = json.dumps({"type": "chat", "username": username, "message": data["message"]})
                await broadcast(chat_msg)
            elif data["type"] == "playlist_save":
                # Guarda la playlist en un archivo JSON
                name = data["name"]
                playlist = data["playlist"]
                save_playlist(name, playlist)
                update_msg = json.dumps({
                    "type": "playlist_saved",
                    "name": name,
                    "playlist": playlist
                })
                await broadcast(update_msg)
            elif data["type"] == "playlist_selected":
                # Actualiza la playlist global con la playlist seleccionada por el usuario
                globalPlaylist = data["playlist"]
                selected_msg = json.dumps({
                    "type": "playlist_updated",
                    "playlist": globalPlaylist,
                    "autoPlay": True
                })
                await broadcast(selected_msg)
            elif data["type"] == "song_added":
                # Una nueva canción ha sido agregada para reproducirse en vivo
                songData = data["song"]
                globalPlaylist.append(songData)
                playlist_msg = json.dumps({"type": "playlist_updated", "playlist": globalPlaylist})
                await broadcast(playlist_msg)
            elif data["type"] == "control":
                # Difunde eventos de control (play, pause, seek, skip, etc.)
                await broadcast(json.dumps(data), sender=websocket)
            elif data["type"] == "playlist_reorder":
                # Actualizar el orden global según la reorganización enviada por el cliente
                globalPlaylist = data["playlist"]
                const_message = json.dumps({"type": "playlist_updated", "playlist": globalPlaylist})
                await broadcast(const_message)
                
            elif data["type"] == "volume_update":
                # Difunde el cambio de volumen a todos los
                await broadcast(json.dumps(data), sender=websocket)
            # Puedes agregar más tipos de mensajes (por ejemplo, sincronización de reproducción)
    except Exception as e:
        print("Error en conexión WebSocket:", e)
    finally:
        username = connected_clients.get(websocket, "Desconocido")
        if websocket in connected_clients:
            del connected_clients[websocket]
        left_msg = json.dumps({"type": "user_left", "username": username})
        await broadcast(left_msg)
        await broadcast_active_users() 