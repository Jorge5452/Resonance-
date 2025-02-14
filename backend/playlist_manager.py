import json
import os

PLAYLIST_FILE = "playlists.json"

def load_all_playlists():
    """Carga todas las playlists guardadas desde el archivo JSON."""
    if not os.path.exists(PLAYLIST_FILE):
        return {}
    with open(PLAYLIST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_playlist(name, playlist):
    """Guarda (o actualiza) una playlist en el archivo JSON."""
    playlists = load_all_playlists()
    playlists[name] = playlist
    with open(PLAYLIST_FILE, "w", encoding="utf-8") as f:
        json.dump(playlists, f, ensure_ascii=False, indent=2) 