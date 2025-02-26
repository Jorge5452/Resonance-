// Agregar log al inicio del archivo para ver cuándo se carga main.js
console.log("main.js: Inicio de la carga");

// Variables globales
var player;
var isAdmin = false;
var playlist = [];
var currentSongIndex = 0;
var isPlaying = false;
var savedPlaylists = {};

// Variables globales para el volumen
let masterVolumeValue = 50;
let userVolumeValue = 50;

// Constantes para el manejo del chat
const CHAT_HISTORY_KEY = 'chatHistory';
const MAX_CHAT_MESSAGES = 50; // Límite de mensajes a almacenar


// Verificar si la API de YouTube ya está cargada antes de inyectarla
if (!window.YT || !window.YT.Player) {
  var tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  var firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  console.log("main.js: API de YouTube agregada dinámicamente");
} else {
  console.log("main.js: API de YouTube ya estaba cargada");
}

// Declare YT variable globally.  This is necessary because the YouTube IFrame API adds the YT object to the global scope.
var YT;

// Función requerida por la API de YouTube para inicializar el reproductor
function onYouTubeIframeAPIReady() {
  console.log("main.js: onYouTubeIframeAPIReady se ha llamado");
  player = new YT.Player("player", {
    height: "360",
    width: "640",
    videoId: "",
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

// Se ejecuta cuando el reproductor está listo
function onPlayerReady(event) {
  console.log("main.js: onPlayerReady se ha llamado");
  updateVolume();
  updateVideoInfo(); // Añadir esta línea
}

// Se actualiza el estado y se gestiona el fin del video
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    if (isAdmin) {
      if (currentSongIndex < playlist.length - 1) {
        const nextIndex = currentSongIndex + 1;
        loadSong(nextIndex);
        if (window.socket && window.socket.readyState === WebSocket.OPEN) {
          window.socket.send(
            JSON.stringify({
            type: "control",
            action: "skip",
              songIndex: nextIndex,
            })
          );
        }
      }
    }
  } else if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updateVideoCover();
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
  }
}

// Actualiza la carátula del video en reproducción
function updateVideoCover() {
  if (playlist[currentSongIndex]) {
    var videoData = playlist[currentSongIndex];
    var thumbnail =
      videoData.thumbnail ||
      `https://img.youtube.com/vi/${videoData.id}/maxresdefault.jpg`;
    document.getElementById(
      "videoCover"
    ).style.backgroundImage = `url(${thumbnail})`;
  }
}

// Extrae el ID del video a partir de la url proporcionada
function getVideoId(url) {
  var videoId = null;
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("youtube.com")) {
      if (parsedUrl.pathname === "/watch") {
        videoId = parsedUrl.searchParams.get("v");
      } else if (parsedUrl.pathname.startsWith("/embed/")) {
        videoId = parsedUrl.pathname.split("/")[2];
      }
    } else if (parsedUrl.hostname === "youtu.be") {
      videoId = parsedUrl.pathname.slice(1);
    }
  } catch (e) {
    const regExp = /(?:youtube\.com\/.*(?:\?|&)v=|youtu\.be\/)([^&\n]+)/;
    const match = url.match(regExp);
    if (match && match[1]) {
      videoId = match[1];
    }
  }
  return videoId;
}

// Carga la canción indicada de la playlist en el reproductor
function loadSong(index) {
  if (index < 0 || index >= playlist.length) return;
  currentSongIndex = index;
  const videoId = playlist[index].id;
  if (player && typeof player.loadVideoById === "function") {
    player.loadVideoById(videoId);
    updateVideoInfo(); // Añadir esta línea
  } else {
    setTimeout(() => loadSong(index), 500);
  }
  updatePlaylistUI();
}

// Actualiza la interfaz de la playlist con soporte para selección y reordenación por DRAG & DROP
function updatePlaylistUI() {
  console.log(
    "updatePlaylistUI: Updating playlist UI. Total songs:",
    playlist.length
  );
  const playlistElement = document.getElementById("playlist");
  playlistElement.innerHTML = "";

  playlist.forEach((videoData, index) => {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between p-2 bg-gray-700 rounded";
    li.setAttribute("draggable", "true");

    // Permitir arrastrar:
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", index);
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      li.style.border = "2px dashed #FFF";
    });

    li.addEventListener("dragleave", (e) => {
      li.style.border = "none";
    });

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.style.border = "none";
      const draggedIndex = e.dataTransfer.getData("text/plain");
      const targetIndex = index;
      if (draggedIndex === "" || draggedIndex === targetIndex.toString())
        return;

      // Reorganizar el playlist
      const draggedItem = playlist.splice(draggedIndex, 1)[0];
      playlist.splice(targetIndex, 0, draggedItem);
      updatePlaylistUI();

      // Enviar el nuevo orden al servidor para sincronizar
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
          type: "playlist_reorder",
            playlist: playlist,
          })
        );
      }
    });

    // Permitir selección al hacer clic (excluyendo el botón de borrar)
    li.addEventListener("click", (e) => {
      // Si se clickea el botón de eliminar, no hacer nada
      if (
        e.target.tagName.toLowerCase() === "button" ||
        e.target.tagName.toLowerCase() === "svg" ||
        e.target.tagName.toLowerCase() === "path"
      )
        return;
      if (isAdmin) {
        loadSong(index);
        if (window.socket && window.socket.readyState === WebSocket.OPEN) {
          window.socket.send(
            JSON.stringify({
            type: "control",
            action: "skip",
              songIndex: index,
            })
          );
        }
      }
    });

    li.innerHTML = `
      <span class="truncate ${
        index === currentSongIndex ? "font-bold text-blue-400" : ""
      }">${videoData.title}</span>
      <button class="text-red-500 hover:text-red-700" onclick="removeSong(${index})">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    `;
    playlistElement.appendChild(li);
  });
}

// Calcula el volumen efectivo
// function updateVolume() {
//   const masterVolume = Number.parseInt(
//     document.getElementById("masterVolume").value
//   );
//   const userVolume = Number.parseInt(
//     document.getElementById("userVolume").value
//   );
//   const effectiveVolume = Math.round((masterVolume * userVolume) / 100);
//   if (player && typeof player.setVolume === "function") {
//     player.setVolume(effectiveVolume);
//   }
//   updateVolumeIcons();
// }

function updateVolume(source) {
  const masterVolume = Number.parseInt(document.getElementById("masterVolume").value);
  const userVolume = Number.parseInt(document.getElementById("userVolume").value);
  
  // Actualizar variables globales
  masterVolumeValue = masterVolume;
  userVolumeValue = userVolume;
  
  // Calcular volumen efectivo (0-100)
  const effectiveVolume = Math.round((masterVolume * userVolume) / 100);
  console.log(`[updateVolume] source: ${source}, masterVolume: ${masterVolume}, userVolume: ${userVolume}, effectiveVolume: ${effectiveVolume}`);
  
  // Aplicar el volumen al reproductor
  if (player && typeof player.setVolume === "function") {
    player.setVolume(effectiveVolume);
  }
  
  // Si el cambio viene del volumen maestro y el usuario es admin, sincronizar con otros usuarios
  if (source === 'master' && isAdmin) {
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: "volume_update",
        masterVolume: masterVolume
      }));
    }
  }
  
  updateVolumeIcons();
}


// Función para manejar actualizaciones de volumen maestro desde el servidor
function handleVolumeUpdate(data) {
  if (!isAdmin) {
      console.log("handleVolumeUpdate: Received master volume update:", data.masterVolume);
      document.getElementById("masterVolume").value = data.masterVolume;
      masterVolumeValue = data.masterVolume;
      updateVolume('remote');
  }
}



// Actualiza los iconos de volumen
function updateVolumeIcons() {
  const masterVolume = Number.parseInt(
    document.getElementById("masterVolume").value
  );
  const userVolume = Number.parseInt(
    document.getElementById("userVolume").value
  );

  const masterVolumeBtn = document.getElementById("masterVolumeBtn");
  const userVolumeBtn = document.getElementById("userVolumeBtn");

  // Actualizar icono de volumen maestro
  if (masterVolume === 0) {
    masterVolumeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>';
  } else {
    masterVolumeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>';
  }

  // Actualizar icono de volumen de usuario
  if (userVolume === 0) {
    userVolumeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>';
  } else {
    userVolumeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>';
  }
}

// Actualiza la barra de adelanto
function updateSeekBar() {
  if (
    player &&
    typeof player.getCurrentTime === "function" &&
    typeof player.getDuration === "function"
  ) {
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    document.getElementById("seekBar").value = percentage;
  }
}

// Actualizar la barra de adelanto cada segundo
setInterval(updateSeekBar, 1000);

// Remover una canción de la playlist
function removeSong(index) {
  // Remover la canción del playlist local
  playlist.splice(index, 1);
  updatePlaylistUI();
  if (index === currentSongIndex) {
    if (playlist.length > 0) {
      loadSong(index % playlist.length);
    } else {
      player.stopVideo();
      currentSongIndex = 0;
    }
  } else if (index < currentSongIndex) {
    currentSongIndex--;
  }

  // Enviar el nuevo orden de la playlist al servidor para sincronizar con todos los clientes
  if (window.socket && window.socket.readyState === WebSocket.OPEN) {
    window.socket.send(
      JSON.stringify({
      type: "playlist_reorder",
        playlist: playlist,
      })
    );
  }
}

// Guardar la playlist actual
function saveCurrentPlaylist(name) {
  savedPlaylists[name] = [...playlist];
  updateSavedPlaylistsUI();
  localStorage.setItem("savedPlaylists", JSON.stringify(savedPlaylists));
}

// =======================
// NUEVA FUNCIÓN: Modal de confirmación
// =======================
// Función para mostrar una ventana modal de confirmación y devolver una promesa que se resuelve con true (aceptado) o false (cancelado)
function openConfirmModal(message) {
  return new Promise((resolve, reject) => {
    const modal = document.getElementById("confirmModal");
    const confirmMessageElem = document.getElementById("confirmMessage");
    const confirmYes = document.getElementById("confirmYes");
    const confirmNo = document.getElementById("confirmNo");
    
    // Si alguno de los elementos no existe, se usa confirm() como respaldo
    if (!modal || !confirmMessageElem || !confirmYes || !confirmNo) {
      return resolve(confirm(message));
    }
    
    confirmMessageElem.textContent = message;
    modal.classList.remove("hidden");
    
    function cleanup() {
      modal.classList.add("hidden");
      confirmYes.removeEventListener("click", onYes);
      confirmNo.removeEventListener("click", onNo);
    }
    
    function onYes() {
      cleanup();
      resolve(true);
    }
    
    function onNo() {
      cleanup();
      resolve(false);
    }
    
    confirmYes.addEventListener("click", onYes);
    confirmNo.addEventListener("click", onNo);
  });
}

// Cambios en la función loadSavedPlaylist
async function loadSavedPlaylist(name) {
  if (savedPlaylists[name]) {
    // Mostrar modal de confirmación y esperar respuesta del usuario
    const confirmed = await openConfirmModal("¿Estás seguro de cargar la playlist '" + name + "'? Se sincronizará en todos los clientes.");
    if (!confirmed) {
      console.log("loadSavedPlaylist: La carga fue cancelada por el usuario.");
      return;
    }
    
    // Notificar al servidor que se ha seleccionado una playlist para sincronizarla en todos los clientes
    let selectedPlaylist = savedPlaylists[name];
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      console.log("loadSavedPlaylist: Enviando playlist seleccionada al servidor:", name, selectedPlaylist);
      socket.send(JSON.stringify({
        type: "playlist_selected",
        name: name,
        playlist: selectedPlaylist
      }));
    } else {
      console.log("loadSavedPlaylist: No se pudo conectar vía WebSocket. Actualizando localmente.");
      playlist = [...selectedPlaylist];
      currentSongIndex = 0;
      updatePlaylistUI();
      if (playlist.length > 0) {
        loadSong(0);
      }
    }
  }
}

// Actualizar la interfaz de playlists guardadas
function updateSavedPlaylistsUI(playlists) {
  console.log("updateSavedPlaylistsUI: Received saved playlists", playlists);
  const savedPlaylistsElement = document.getElementById("savedPlaylists");
  savedPlaylistsElement.innerHTML = "";
  Object.keys(playlists).forEach((name) => {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between p-2 bg-gray-700 rounded";
    li.innerHTML = `
      <span class="truncate">${name}</span>
      <button class="text-blue-500 hover:text-blue-700" onclick="loadSavedPlaylist('${name}')">Cargar</button>
    `;
    savedPlaylistsElement.appendChild(li);
  });
}

// Simular usuarios activos
function simulateActiveUsers() {
  const users = ["Usuario1", "Usuario2", "Usuario3"];
  const activeUsersElement = document.getElementById("activeUsers");
  activeUsersElement.innerHTML = "";
  users.forEach((user) => {
    const li = document.createElement("li");
    li.className = "p-2 bg-gray-700 rounded";
    li.textContent = user;
    activeUsersElement.appendChild(li);
  });
}

// Actualiza la información del video
function updateVideoInfo() {
  if (player && playlist[currentSongIndex]) {
    const videoData = playlist[currentSongIndex];
    document.getElementById("videoTitle").textContent = videoData.title;

    if (typeof player.getDuration === "function") {
      const duration = player.getDuration();
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      document.getElementById(
        "videoDuration"
      ).textContent = `Duración: ${minutes}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }
  }
}

// =======================
// NUEVA FUNCIÓN: Conexión WebSocket
// =======================
function connectWebSocket() {
  window.socket = new WebSocket("ws://localhost:8080");
  socket.onopen = function () {
    console.log("connectWebSocket: Connection opened.");
    console.log(
      "connectWebSocket: Sending register message for username:",
      window.username
    );
    socket.send(
      JSON.stringify({ type: "register", username: window.username })
    );
    // Solicitar las playlists guardadas desde el servidor al conectar
    loadSavedPlaylists();
  };
  socket.onmessage = function (event) {
    console.log("connectWebSocket: Message received:", event.data);
    const data = JSON.parse(event.data);
    if (data.type === "chat") {
      addChatMessage(data.username + ": " + data.message);
    } 
    else if (data.type === "volume_update") {
      handleVolumeUpdate(data);
    } else if (data.type === "user_joined") {
      addChatMessage("[Sistema] " + data.username + " se ha unido.");
    } else if (data.type === "user_left") {
      addChatMessage("[Sistema] " + data.username + " ha salido.");
    } else if (data.type === "active_users") {
      updateActiveUsers(data.users);
    } else if (data.type === "playlist_updated") {
      // Actualizar el playlist en vivo con la nueva lista enviada por el servidor.
      playlist = data.playlist;
      updatePlaylistUI();
      // Si se indicó autoPlay (por ejemplo, al seleccionar una playlist guardada),
      // reproducir la primera canción automáticamente
      if (data.autoPlay && playlist.length > 0) {
        loadSong(0);
      }
    } else if (data.type === "loaded_playlists") {
      // Se recibe la lista de playlists guardadas desde el servidor
      savedPlaylists = data.playlists;
      updateSavedPlaylistsUI(savedPlaylists);
    } else if (data.type === "playlist_saved") {
      alert("Playlist '" + data.name + "' guardada exitosamente.");
      // Actualizar la lista de playlists tras guardar
      loadSavedPlaylists();
    } else if (data.type === "control") {
      console.log("Mensaje de control recibido:", data);
      // Aquí puedes implementar la lógica para sincronizar la reproducción,
      // por ejemplo, cambiar el estado del reproductor según la acción.
      console.log("Mensaje de control recibido:", data);
      if (data.action === "play") {
         // Iniciar la reproducción en todos los clientes en el tiempo indicado
         if (player && typeof player.seekTo === "function") {
          player.seekTo(data.currentTime, true);
          player.playVideo();
         }
      } else if (data.action === "pause") {
         // Pausar el video en todos los clientes
         if (player && typeof player.pauseVideo === "function") {
          player.pauseVideo();
         }
      } else if (data.action === "seek") {
         // Cambiar el tiempo del video a la posición indicada
         if (player && typeof player.seekTo === "function") {
          player.seekTo(data.newTime, true);
         }
      } else if (data.action === "skip") {
         // Saltar a la siguiente canción. Se espera que el mensaje incluya "songIndex".
         if (data.songIndex !== undefined) {
          loadSong(data.songIndex);
        }
      }
    }
  };
  socket.onclose = function () {
    console.log("Conexión WebSocket cerrada. Reintentando en 3 segundos...");
    setTimeout(connectWebSocket, 3000);
  };
}

// =======================
// NUEVA FUNCIÓN: Solicita las playlists guardadas al servidor
// =======================
function loadSavedPlaylists() {
  console.log("loadSavedPlaylists: Requesting saved playlists");
  if (window.socket && window.socket.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({ type: "playlist_load" }));
  }
}

// =======================
// INICIALIZACIÓN al cargar el DOM
// =======================
document.addEventListener("DOMContentLoaded", () => {
  console.log("main.js: DOMContentLoaded event fired.");

  // Manejo del modal de nombre de usuario
  const usernameModal = document.getElementById("usernameModal");
  const usernameInput = document.getElementById("usernameInput");
  const usernameSubmit = document.getElementById("usernameSubmit");

  // Función para manejar el envío del nombre de usuario
  function handleUsernameSubmit() {
    const enteredName = usernameInput.value.trim();
    if (!enteredName) {
      alert("Por favor, ingresa un nombre de usuario.");
      return;
    }
    window.username = enteredName;
    usernameModal.style.display = "none";
    connectWebSocket();
  }

  // Event listener para el botón
  usernameSubmit.addEventListener("click", handleUsernameSubmit);

  // Event listener para la tecla Enter en el input
  usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleUsernameSubmit();
    }
  });
  // Se solicitarán las playlists guardadas vía WebSocket una vez conectado

  // Inicialización del historial del chat
  const storedChat = localStorage.getItem(CHAT_HISTORY_KEY);
  
  if (storedChat) {
    try {
      const parsedChat = JSON.parse(storedChat);
      console.log("DOMContentLoaded: Loaded chat history. Total messages:", parsedChat.length);
      
      // Mostrar solo los mensajes de las últimas 24 horas
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentMessages = parsedChat.filter(msg => msg.timestamp > oneDayAgo);
      
      recentMessages.forEach(msg => addChatMessage(msg.message));
      
      // Actualizar el localStorage con solo los mensajes recientes
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(recentMessages));
    } catch (e) {
      console.error("DOMContentLoaded: Error parsing chat history. Clearing chat history.", e);
      localStorage.removeItem(CHAT_HISTORY_KEY);
    }
  } else {
    console.log("DOMContentLoaded: No chat history found.");
  }

  // Evento para agregar una canción al playlist en vivo (sin recargar la página)
  document.getElementById("addSong").addEventListener("click", () => {
    const url = document.getElementById("youtubeLink").value;
    const videoId = getVideoId(url);
    if (videoId) {
      fetchVideoDetails(videoId).then((videoData) => {
        if (window.socket && window.socket.readyState === WebSocket.OPEN) {
          window.socket.send(
            JSON.stringify({ type: "song_added", song: videoData })
          );
        }
      });
    } else {
      alert("Link de YouTube inválido");
    }
  });

  // Evento para modificar la posición (seek) mediante la barra de progreso
  document.getElementById("seekBar").addEventListener("input", (e) => {
    if (!isAdmin) {
      alert("Solo el administrador puede adelantar la canción");
      return;
    }
    if (player && typeof player.getDuration === "function") {
      const duration = player.getDuration();
      const value = Number.parseFloat(e.target.value);
      const newTime = (value / 100) * duration;
      // Actualizar el video localmente
      player.seekTo(newTime, true);
      // Enviar mensaje de control para sincronizar la posición en todos los clientes
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
          type: "control",
          action: "seek",
            newTime: newTime,
          })
        );
      }
    }
  });

  // Control de reproducción
  document.getElementById("playPause").addEventListener("click", () => {
    if (!isAdmin) {
      alert("Solo el administrador puede controlar la reproducción");
      return;
    }
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
          type: "control",
          action: "pause",
            currentTime: player.getCurrentTime(),
          })
        );
      }
    } else {
      player.playVideo();
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
          type: "control",
          action: "play",
            currentTime: player.getCurrentTime(),
          })
        );
      }
    }
  });

  // Adelantar la canción
  document.getElementById("next").addEventListener("click", () => {
    if (!isAdmin) {
      alert("Solo el administrador puede adelantar la canción");
      return;
    }
    const currentTime = player.getCurrentTime();
    player.seekTo(currentTime + 10, true);
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      window.socket.send(
        JSON.stringify({
        type: "control",
        action: "seek",
          newTime: currentTime + 10,
        })
      );
    }
  });

  // Saltar canción
  document.getElementById("skip").addEventListener("click", () => {
    if (!isAdmin) {
      alert("Solo el administrador puede saltar canciones");
      return;
    }
    if (currentSongIndex < playlist.length - 1) {
      loadSong(currentSongIndex + 1);
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
          type: "control",
          action: "skip",
            songIndex: currentSongIndex,
          })
        );
      }
    } else {
      alert("No hay más canciones en la playlist");
    }
  });

  // Control de volumen
  document.getElementById("masterVolume").addEventListener("input", (e) => {
    if (isAdmin) {
        updateVolume('master');
    } else {
        e.preventDefault();
        alert("Solo el administrador puede modificar el volumen general");
        e.target.value = masterVolumeValue;
    }
});

document.getElementById("userVolume").addEventListener("input", () => {
  updateVolume('user');
});


  // Cambio de rol
  document.getElementById("toggleRole").addEventListener("click", function () {
    isAdmin = !isAdmin;
    this.textContent = isAdmin ? "Cambiar a Usuario" : "Cambiar a Admin";
    this.classList.toggle("bg-blue-600");
    this.classList.toggle("bg-red-600");
    updateButtonStates();
  });

  // Funcionalidad del chat
  document.getElementById("sendChat").addEventListener("click", () => {
    const messageInput = document.getElementById("chatInput");
    const message = messageInput.value.trim();
    if (message) {
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(JSON.stringify({ type: "chat", message: message }));
      }
      messageInput.value = "";
    }
  });

  document.getElementById("chatInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      document.getElementById("sendChat").click();
    }
  });

  // Guardar playlist
  document.getElementById("savePlaylist").addEventListener("click", () => {
    const name = document.getElementById("newPlaylistName").value.trim();
    if (name && playlist.length > 0) {
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
          type: "playlist_save",
          name: name,
            playlist: playlist,
          })
        );
      } else {
        alert("Conexión no establecida para guardar la playlist");
      }
      document.getElementById("newPlaylistName").value = "";
    } else {
      alert(
        "Ingrese un nombre válido y asegúrese de que la playlist no esté vacía"
      );
    }
  });

  // Manejo de pestañas
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-tab");
      tabContents.forEach((content) => {
        content.classList.add("hidden");
      });
      document.getElementById(tabId).classList.remove("hidden");
      tabButtons.forEach((btn) => btn.classList.remove("bg-gray-700"));
      button.classList.add("bg-gray-700");
    });
  });

  // Inicializar la primera pestaña
  tabButtons[0].click();

  // Inicializar estados de botones
  updateButtonStates();

  // Agregar event listeners para los botones de volumen
  document.getElementById("masterVolumeBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const volumeSlider = document.getElementById("masterVolume");
    volumeSlider.classList.toggle("volume-active");
  });

  document.getElementById("userVolumeBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const volumeSlider = document.getElementById("userVolume");
    volumeSlider.classList.toggle("volume-active");
  });

  document.addEventListener("click", () => {
    document.getElementById("masterVolume").classList.remove("volume-active");
    document.getElementById("userVolume").classList.remove("volume-active");
  });

  // Llamar a updateVolumeIcons() al inicio para establecer los iconos correctos
  updateVolumeIcons();

});

// Actualizar estados de botones
function updateButtonStates() {
  const buttons = ["playPause", "next", "skip"];
  buttons.forEach((id) => {
    const button = document.getElementById(id);
    button.disabled = !isAdmin;
    button.classList.toggle("opacity-50", !isAdmin);
    button.classList.toggle("cursor-not-allowed", !isAdmin);
  });
  document.getElementById("masterVolume").disabled = !isAdmin;
  document.getElementById("seekBar").disabled = !isAdmin;
}


function addChatMessage(message) {
  console.log("addChatMessage: Adding chat message:", message);
  const chatHistoryElement = document.getElementById("chatHistory");
  const p = document.createElement("p");
  p.className = "bg-gray-700 p-2 rounded";

  // Verificar si el mensaje contiene ": " para separar el nombre del mensaje
  const colonIndex = message.indexOf(": ");
  if (colonIndex !== -1) {
    const username = message.substring(0, colonIndex);
    const messageText = message.substring(colonIndex + 2);
    p.innerHTML = `<strong>${username}</strong>: ${messageText}`;
  } else {
    p.textContent = message;
  }

  chatHistoryElement.appendChild(p);
  chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;

  // Manejo del historial en localStorage
  try {
    let chatMessages = [];
    const storedChat = localStorage.getItem(CHAT_HISTORY_KEY);
    
    if (storedChat) {
      chatMessages = JSON.parse(storedChat);
    }

    // Agregar nuevo mensaje
    chatMessages.push({
      message: message,
      timestamp: Date.now()
    });

    // Mantener solo los últimos MAX_CHAT_MESSAGES mensajes
    if (chatMessages.length > MAX_CHAT_MESSAGES) {
      chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
    }

    // Guardar en localStorage
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatMessages));

    // Verificar el tamaño del localStorage
    checkLocalStorageSize();

  } catch (e) {
    console.error("addChatMessage: Error managing chat history:", e);
    cleanupLocalStorage();
  }
}

// Función para verificar y gestionar el tamaño del localStorage
function checkLocalStorageSize() {
  const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
  let totalSize = 0;

  try {
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length * 2; // Multiplicar por 2 porque cada carácter ocupa 2 bytes
      }
    }

    console.log(`Storage size: ${(totalSize / 1024).toFixed(2)}KB`);

    if (totalSize > MAX_STORAGE_SIZE) {
      cleanupLocalStorage();
    }
  } catch (e) {
    console.error("Error checking localStorage size:", e);
    cleanupLocalStorage();
  }
}


// Función para limpiar el localStorage
function cleanupLocalStorage() {
  console.log("Cleaning up localStorage...");
  try {
    // Mantener solo los mensajes más recientes
    const chatHistory = localStorage.getItem(CHAT_HISTORY_KEY);
    if (chatHistory) {
      const messages = JSON.parse(chatHistory);
      const recentMessages = messages.slice(-Math.floor(MAX_CHAT_MESSAGES / 2));
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(recentMessages));
    }
  } catch (e) {
    console.error("Error during cleanup:", e);
    localStorage.removeItem(CHAT_HISTORY_KEY);
  }
}

// Fetch additional video details
function fetchVideoDetails(videoId) {
  return fetch(
    `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
  )
    .then((response) => response.json())
    .then((data) => ({
      id: videoId,
      title: data.title,
      thumbnail: data.thumbnail_url,
    }))
    .catch((error) => {
      console.error("Error fetching video details", error);
      return {
        id: videoId,
        title: videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      };
    });
}

// NUEVA FUNCIÓN: Actualiza la lista de usuarios activos en el DOM
function updateActiveUsers(users) {
  console.log("updateActiveUsers: Updating active users. Count:", users.length);
  const activeUsersElement = document.getElementById("activeUsers");
  activeUsersElement.innerHTML = "";
  users.forEach((user) => {
    const li = document.createElement("li");
    li.className = "p-2 bg-gray-700 rounded";
    li.textContent = user;
    activeUsersElement.appendChild(li);
  });

  // Si no hay nadie más conectado (o sólo está el usuario actual), se borra el historial del chat
  if (
    users.length === 0 ||
    (users.length === 1 && users[0] === window.username)
  ) {
    console.log(
      "updateActiveUsers: Solo este cliente está conectado. Borrando historial del chat."
    );
    localStorage.removeItem("chatHistory");
  }
}
