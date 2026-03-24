document.addEventListener('DOMContentLoaded', () => {
    // --- Mouse Idle Timeout ---
    let mouseTimeout;
    const resetMouseTimer = () => {
        document.body.classList.remove('mouse-idle');
        clearTimeout(mouseTimeout);
        mouseTimeout = setTimeout(() => {
            document.body.classList.add('mouse-idle');
        }, 2500);
    };
    
    // Bind to body and document
    document.addEventListener('mousemove', resetMouseTimer);
    document.addEventListener('mousedown', resetMouseTimer);
    document.addEventListener('keydown', resetMouseTimer);
    resetMouseTimer();

    // --- Helper Functions ---
    function shuffleOurArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // --- State & Constants ---
    const playlist = []; // Array of File objects
    const MAX_WINDOWS = 4;
    let activeWindowsCount = 4;

    // --- DOM Elements ---
    const videoUpload = document.getElementById('videoUpload');
    const togglePlaylistBtn = document.getElementById('togglePlaylistBtn');
    const closePlaylistBtn = document.getElementById('closePlaylistBtn');
    const playlistSidebar = document.getElementById('playlistSidebar');
    const playlistContainer = document.getElementById('playlistContainer');
    const playlistCount = document.getElementById('playlistCount');
    const layoutContainer = document.getElementById('layoutContainer');
    const layoutBtns = document.querySelectorAll('.layout-controls .nav-btn');
    const template = document.getElementById('videoWindowTemplate');

    // --- Layout Management ---
    layoutBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            layoutBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const layoutClass = btn.dataset.layout;
            layoutContainer.className = `layout-container ${layoutClass}`;
            
            // Re-calc active windows based on layout (Visual only for now, videos still play in bg if hidden)
            // But we keep all 4 mounted and just use CSS to hide them (display:none)
        });
    });

    // --- Playlist & Upload Management ---
    videoUpload.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        files.forEach(file => {
            if (file.type.startsWith('video/')) {
                playlist.push(file);
            }
        });
        
        // Reset input to allow re-uploading the same file if needed
        videoUpload.value = ''; 
        renderPlaylist();
    });

    togglePlaylistBtn.addEventListener('click', () => {
        playlistSidebar.classList.toggle('hidden');
    });

    closePlaylistBtn.addEventListener('click', () => {
        playlistSidebar.classList.add('hidden');
    });

    function renderPlaylist() {
        playlistCount.textContent = playlist.length;
        if (playlist.length === 0) {
            playlistContainer.innerHTML = '<p style="padding: 1rem; color: var(--text-muted); text-align: center;">No videos uploaded yet.</p>';
            return;
        }

        playlistContainer.innerHTML = '';
        playlist.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.draggable = true;
            item.dataset.index = index;
            
            item.innerHTML = `
                <span class="playlist-item-index">${index + 1}</span>
                <span class="playlist-item-name" title="${file.name}">${file.name}</span>
                <button class="nav-btn" style="padding:0.2rem 0.5rem; font-size:0.8rem;" onclick="assignToNextAvailable(${index})">▶</button>
            `;

            // Drag API for playlist item
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                e.dataTransfer.effectAllowed = 'copy';
            });

            playlistContainer.appendChild(item);
        });
    }

    // Assign via button click
    window.assignToNextAvailable = (fileIndex) => {
        const file = playlist[fileIndex];
        let targetDoc = windows.find(w => !w.hasVideo);
        if (!targetDoc) targetDoc = windows[0]; // fallback
        
        const newIdx = targetDoc.localPlaylist.length;
        targetDoc.localPlaylist.push(file);
        targetDoc.playbackOrder.push(newIdx);

        if (!targetDoc.hasVideo) {
            targetDoc.playHead(targetDoc.playbackOrder.length - 1);
        } else {
            targetDoc.updateMetadataUI();
        }
    };

    // --- Video Window Class ---
    class VideoWindow {
        constructor(index) {
            this.index = index;
            this.blobUrl = null;
            this.hasVideo = false;
            this.localPlaylist = [];
            this.playbackOrder = [];
            this.playheadIndex = -1;
            this.isShuffled = false;
            
            // Clone template
            const clone = template.content.cloneNode(true);
            this.element = clone.querySelector('.video-window');
            this.video = clone.querySelector('video');
            this.metadataFilename = clone.querySelector('.video-filename');
            this.metadataIndex = clone.querySelector('.video-index');
            this.playPauseBtn = clone.querySelector('.play-pause-btn');
            this.prevBtn = clone.querySelector('.prev-btn');
            this.nextBtn = clone.querySelector('.next-btn');
            this.muteBtn = clone.querySelector('.mute-btn');
            this.timeCurrent = clone.querySelector('.time-current');
            this.timeTotal = clone.querySelector('.time-total');
            this.timelineSlider = clone.querySelector('.timeline-slider');
            this.volumeSlider = clone.querySelector('.volume-slider');
            this.panHorizontal = clone.querySelector('.slider-horizontal');
            this.panVertical = clone.querySelector('.slider-vertical');
            this.fullscreenBtn = clone.querySelector('.fullscreen-window-btn');
            this.favoriteBtn = clone.querySelector('.favorite-btn');
            this.emptyState = clone.querySelector('.empty-state');
            this.uploadControls = clone.querySelector('.local-upload-controls');
            this.uploadEmpty = clone.querySelector('.local-upload-empty');
            this.shuffleBtn = clone.querySelector('.shuffle-btn');
            
            this.element.dataset.windowIndex = index;
            
            this.setupEvents();
            layoutContainer.appendChild(this.element);
        }

        setupEvents() {
            // Drag and Drop
            this.element.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                this.element.classList.add('drag-over');
            });
            this.element.addEventListener('dragleave', () => {
                this.element.classList.remove('drag-over');
            });
            this.element.addEventListener('drop', (e) => {
                e.preventDefault();
                this.element.classList.remove('drag-over');
                const fileIndex = e.dataTransfer.getData('text/plain');
                if (fileIndex !== "") {
                    const file = playlist[parseInt(fileIndex, 10)];
                    if (file) {
                        const newIdx = this.localPlaylist.length;
                        this.localPlaylist.push(file);
                        this.playbackOrder.push(newIdx);

                        if (!this.hasVideo) {
                            this.playHead(this.playbackOrder.length - 1);
                        } else {
                            this.updateMetadataUI();
                        }
                    }
                }
            });

            // Local Upload Handlers
            const handleUpload = (e) => {
                const files = Array.from(e.target.files).filter(f => f.type.startsWith('video/'));
                if (files.length > 0) {
                    const startIdx = this.localPlaylist.length;
                    this.localPlaylist.push(...files);
                    
                    const addedIndices = Array.from({length: files.length}, (_, i) => startIdx + i);
                    if (this.isShuffled) {
                        shuffleOurArray(addedIndices);
                    }
                    this.playbackOrder.push(...addedIndices);

                    if (!this.hasVideo) {
                        this.playHead(this.playbackOrder.length - addedIndices.length);
                    } else {
                        this.updateMetadataUI();
                    }
                }
                e.target.value = ''; // reset
            };
            this.uploadControls.addEventListener('change', handleUpload);
            this.uploadEmpty.addEventListener('change', handleUpload);

            // Shuffle Toggle
            this.shuffleBtn.addEventListener('click', () => {
                this.isShuffled = !this.isShuffled;
                this.shuffleBtn.classList.toggle('active', this.isShuffled);
                
                if (this.localPlaylist.length === 0) return;
                
                if (this.playheadIndex === -1) {
                    this.playbackOrder = Array.from({length: this.localPlaylist.length}, (_, i) => i);
                    if (this.isShuffled) shuffleOurArray(this.playbackOrder);
                } else {
                    const currentFileIndex = this.playbackOrder[this.playheadIndex];
                    if (this.isShuffled) {
                        const remaining = this.playbackOrder.filter(idx => idx !== currentFileIndex);
                        shuffleOurArray(remaining);
                        this.playbackOrder = [currentFileIndex, ...remaining];
                        this.playheadIndex = 0;
                    } else {
                        this.playbackOrder = Array.from({length: this.localPlaylist.length}, (_, i) => i);
                        this.playheadIndex = currentFileIndex;
                    }
                }
                this.updateMetadataUI();
            });

            // Focus management
            this.element.addEventListener('mousedown', () => {
                windows.forEach(w => w.element.classList.remove('focused'));
                this.element.classList.add('focused');
            });

            // Video events
            this.video.addEventListener('loadedmetadata', () => {
                this.timeTotal.textContent = this.formatTime(this.video.duration);
                this.timelineSlider.max = this.video.duration;
            });
            this.video.addEventListener('timeupdate', () => {
                if (!this.timelineSlider.matches(':active')) {
                    this.timelineSlider.value = this.video.currentTime;
                }
                this.timeCurrent.textContent = this.formatTime(this.video.currentTime);
            });
            this.video.addEventListener('play', () => this.playPauseBtn.textContent = '⏸');
            this.video.addEventListener('pause', () => this.playPauseBtn.textContent = '▶');
            this.video.addEventListener('ended', () => {
                this.playPauseBtn.textContent = '▶';
                if (this.playheadIndex < this.playbackOrder.length - 1) {
                    this.playNext();
                }
            });

            // Controls
            this.playPauseBtn.addEventListener('click', () => this.togglePlay());
            this.prevBtn.addEventListener('click', () => this.playPrev());
            this.nextBtn.addEventListener('click', () => this.playNext());
            
            this.timelineSlider.addEventListener('input', (e) => {
                this.video.currentTime = parseFloat(e.target.value);
            });

            this.muteBtn.addEventListener('click', () => {
                this.video.muted = !this.video.muted;
                this.muteBtn.textContent = this.video.muted ? '🔇' : '🔊';
                if (!this.video.muted && this.video.volume === 0) {
                    this.video.volume = 0.5;
                    this.volumeSlider.value = 0.5;
                }
            });

            this.volumeSlider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                this.video.volume = vol;
                if (vol === 0) {
                    this.video.muted = true;
                    this.muteBtn.textContent = '🔇';
                } else {
                    this.video.muted = false;
                    this.muteBtn.textContent = '🔊';
                }
            });

            this.fullscreenBtn.addEventListener('click', () => {
                if (this.video.requestFullscreen) {
                    this.video.requestFullscreen();
                } else if (this.video.webkitRequestFullscreen) {
                    this.video.webkitRequestFullscreen();
                }
            });

            // Spatial Panning
            this.panHorizontal.addEventListener('input', (e) => {
                this.video.style.objectPosition = `${e.target.value}% center`;
            });
            this.panVertical.addEventListener('input', (e) => {
                this.video.style.objectPosition = `center ${e.target.value}%`;
            });

            // Favorite Button (Download JSON representation)
            this.favoriteBtn.addEventListener('click', () => {
                if (!this.hasVideo) return;
                const data = {
                    title: this.metadataFilename.textContent,
                    playlistIndex: this.metadataIndex.textContent,
                    timestampAdd: new Date().toISOString(),
                    duration: this.timeTotal.textContent
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.metadataFilename.textContent}_favorite.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
                
                this.favoriteBtn.classList.add('active');
                setTimeout(() => this.favoriteBtn.classList.remove('active'), 1000);
            });
        }

        playHead(pIndex) {
            if (pIndex < 0 || pIndex >= this.playbackOrder.length) return;
            this.playheadIndex = pIndex;
            const fileIndex = this.playbackOrder[pIndex];
            const file = this.localPlaylist[fileIndex];
            
            if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = URL.createObjectURL(file);
            this.video.src = this.blobUrl;
            this.metadataFilename.textContent = file.name;
            
            this.hasVideo = true;
            this.element.classList.add('has-video');
            this.updateMetadataUI();
            
            this.video.play().catch(e => console.warn(e));
            
            windows.forEach(w => w.element.classList.remove('focused'));
            this.element.classList.add('focused');
        }

        playNext() {
            if (this.playheadIndex < this.playbackOrder.length - 1) {
                this.playHead(this.playheadIndex + 1);
            }
        }

        playPrev() {
            if (this.playheadIndex > 0) {
                this.playHead(this.playheadIndex - 1);
            }
        }

        updateMetadataUI() {
            if (this.playbackOrder.length > 0) {
                this.metadataIndex.textContent = `[${this.playheadIndex + 1}/${this.playbackOrder.length}]`;
            } else {
                this.metadataIndex.textContent = '';
            }
        }

        togglePlay() {
            if (!this.hasVideo) return;
            if (this.video.paused) {
                this.video.play();
            } else {
                this.video.pause();
            }
        }

        skip(seconds) {
            if (!this.hasVideo) return;
            this.video.currentTime = Math.max(0, Math.min(this.video.currentTime + seconds, this.video.duration));
        }

        adjustVolume(delta) {
            let newVol = Math.max(0, Math.min(this.video.volume + delta, 1));
            this.video.volume = newVol;
            this.volumeSlider.value = newVol;
            if (newVol === 0) {
                this.video.muted = true;
                this.muteBtn.textContent = '🔇';
            } else {
                this.video.muted = false;
                this.muteBtn.textContent = '🔊';
            }
        }

        formatTime(seconds) {
            if (isNaN(seconds)) return "0:00";
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        }
    }

    // Initialize 4 windows
    const windows = [];
    for (let i = 0; i < MAX_WINDOWS; i++) {
        windows.push(new VideoWindow(i));
    }

    // --- Global Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Find focused window, if none, maybe apply to all or first?
        const focusedWindow = windows.find(w => w.element.classList.contains('focused'));
        
        switch(e.key) {
            case ' ': // Spacebar - Play/Pause
                // Prevent scrolling when pressing space
                if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                    e.preventDefault();
                    if (focusedWindow) {
                        focusedWindow.togglePlay();
                    } else {
                        // Toggle all if none focused
                        windows.forEach(w => w.togglePlay());
                    }
                }
                break;
            case 'ArrowRight':
                if (focusedWindow) { e.preventDefault(); focusedWindow.skip(5); }
                break;
            case 'ArrowLeft':
                if (focusedWindow) { e.preventDefault(); focusedWindow.skip(-5); }
                break;
            case 'ArrowUp':
                if (focusedWindow) { e.preventDefault(); focusedWindow.adjustVolume(0.1); }
                break;
            case 'ArrowDown':
                if (focusedWindow) { e.preventDefault(); focusedWindow.adjustVolume(-0.1); }
                break;
        }
    });

    // Clean up memory before unload
    window.addEventListener('beforeunload', () => {
        windows.forEach(w => {
            if (w.blobUrl) URL.revokeObjectURL(w.blobUrl);
        });
    });

});
