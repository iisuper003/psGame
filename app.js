/**
 * Character Quiz Game - Vanilla JS App
 */

const CATEGORIES = ['Slut', 'Twink', 'Shemale'];

// --- Helpers ---
function getProxiedUrl(url) {
    if (!url) return '';
    // If it's already a relative path, local blob, or placeholder, return as is
    if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:') || url.includes('via.placeholder.com') || url.includes('unsplash.com')) return url;
    return `/api/proxy?url=${encodeURIComponent(url)}`;
}

// --- Data Store ---
class DataStore {
    constructor() {
        this.characters = [];
        this.highScores = JSON.parse(localStorage.getItem('charquiz_scores')) || {
            All: { score: 0, streak: 0 },
            Slut: { score: 0, streak: 0 },
            Twink: { score: 0, streak: 0 },
            Shemale: { score: 0, streak: 0 }
        };
        this.customLabels = JSON.parse(localStorage.getItem('charquiz_custom_labels')) || ['milf', 'teen', 'legend'];
    }

    saveLabels() {
        localStorage.setItem('charquiz_custom_labels', JSON.stringify(this.customLabels));
    }

    addLabel(label) {
        const clean = label.trim().toLowerCase();
        if (clean && !this.customLabels.includes(clean)) {
            this.customLabels.push(clean);
            this.saveLabels();
            return true;
        }
        return false;
    }

    deleteLabel(label) {
        this.customLabels = this.customLabels.filter(l => l !== label);
        this.saveLabels();
    }

    async loadCharacters() {
        try {
            const response = await fetch('/api/characters');
            if (response.ok) {
                this.characters = await response.json();
                
                // If API returns an empty array (no data in KV), load dummy
                if (Array.isArray(this.characters) && this.characters.length === 0) {
                    const dummyScript = document.getElementById('dummy-characters');
                    if (dummyScript) {
                        try {
                            this.characters = JSON.parse(dummyScript.textContent);
                            console.log('Loaded dummy characters (KV is empty)');
                        } catch (e) {
                            console.error('Failed to load dummy data fallback:', e);
                        }
                    }
                }
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching characters:', error);
            // Fallback to dummy data in index.html if the API is offline
            const dummyScript = document.getElementById('dummy-characters');
            if (dummyScript) {
                try {
                    this.characters = JSON.parse(dummyScript.textContent);
                    console.log('Loaded dummy characters as fallback');
                } catch (e) {
                    console.error('Failed to load dummy data fallback:', e);
                }
            }
        }
    }

    saveScores() {
        localStorage.setItem('charquiz_scores', JSON.stringify(this.highScores));
    }

    getCharacters(category = 'All') {
        if (category === 'All' || category === 'Mix') return this.characters;
        return this.characters.filter(c => c.category === category);
    }

    async addCharacter(name, category, photoUrl, labels = []) {
        const newChar = { name: name.trim(), category, photoUrl: photoUrl.trim(), labels };
        
        const response = await fetch('/api/characters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newChar)
        });
        
        if (!response.ok) {
            let errorMsg = "Failed to save character to Cloudflare KV";
            try {
                const errData = await response.json();
                if (errData.error) errorMsg += `: ${errData.error}`;
            } catch (e) {
                errorMsg += ` (Status: ${response.status})`;
            }
            throw new Error(errorMsg);
        }
        
        const result = await response.json();
        this.characters.push(result.character);
        return result.character;
    }

    async updateCharacter(id, name, category, photoUrl, labels = []) {
        const updateData = { id, name: name.trim(), category, photoUrl: photoUrl.trim(), labels };
        const response = await fetch('/api/characters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            let errorMsg = "Failed to update character";
            try {
                const errData = await response.json();
                if (errData.error) errorMsg += `: ${errData.error}`;
            } catch (e) {
                errorMsg += ` (Status: ${response.status})`;
            }
            throw new Error(errorMsg);
        }

        const result = await response.json();
        const index = this.characters.findIndex(c => c.id === id);
        if (index !== -1) {
            this.characters[index] = result.character;
        }
        return result.character;
    }

    async deleteCharacter(id) {
        const response = await fetch(`/api/characters?id=${id}`, { method: 'DELETE' });
        
        if (!response.ok) throw new Error("Failed to delete character from Cloudflare KV");
        this.characters = this.characters.filter(c => c.id !== id);
    }

    updateHighScore(category, score, streak) {
        let isNewHigh = false;
        let cat = category === 'Mix' ? 'All' : category;
        if (!this.highScores[cat]) {
            this.highScores[cat] = { score: 0, streak: 0 };
        }
        
        if (score > this.highScores[cat].score) {
            this.highScores[cat].score = score;
            isNewHigh = true;
        }
        if (streak > this.highScores[cat].streak) {
            this.highScores[cat].streak = streak;
        }
        this.saveScores();
        return { isNewHigh, record: this.highScores[cat] };
    }

    exportData() {
        const dataStr = JSON.stringify(this.characters, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'charquiz_backup.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(file, onComplete, onError) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error("Invalid JSON format");
                
                let added = 0;
                for (const char of imported) {
                    if (char.name && char.category && char.photoUrl) {
                        const normalizedName = char.name.trim().toLowerCase();
                        if (!this.characters.some(c => c.name.toLowerCase() === normalizedName)) {
                            // POST to API
                            const response = await fetch('/api/characters', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    id: char.id || undefined,
                                    name: char.name.trim(),
                                    category: char.category,
                                    photoUrl: char.photoUrl.trim(),
                                    labels: Array.isArray(char.labels) ? char.labels : []
                                })
                            });
                            
                            if (response.ok) {
                                const result = await response.json();
                                this.characters.push(result.character);
                                added++;
                            }
                        }
                    }
                }
                onComplete(added);
            } catch (err) {
                onError(err);
            }
        };
        reader.readAsText(file);
    }
}

// --- Confetti Effect ---
const Confetti = {
    canvas: null,
    ctx: null,
    particles: [],
    animId: null,
    
    init() {
        this.canvas = document.getElementById('confettiCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },
    
    fire() {
        this.canvas.classList.remove('hidden');
        this.particles = [];
        const colors = ['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#ec4899'];
        for (let i = 0; i < 150; i++) {
            this.particles.push({
                x: this.canvas.width / 2,
                y: this.canvas.height / 2 + 100,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 1) * 20 - 5,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rot: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10
            });
        }
        
        if (this.animId) cancelAnimationFrame(this.animId);
        this.loop();
        
        setTimeout(() => {
            this.stop();
        }, 4000);
    },
    
    loop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5; // gravity
            p.rot += p.rotSpeed;
            
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rot * Math.PI / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            this.ctx.restore();
            
            // Remove off-screen particles
            if (p.y > this.canvas.height) this.particles.splice(i, 1);
        });
        
        if (this.particles.length > 0) {
            this.animId = requestAnimationFrame(() => this.loop());
        } else {
            this.canvas.classList.add('hidden');
        }
    },
    
    stop() {
        this.particles = [];
        this.canvas.classList.add('hidden');
        if (this.animId) cancelAnimationFrame(this.animId);
    }
};

// --- Game Engine ---
class GameEngine {
    constructor(dataStore, uiManager) {
        this.store = dataStore;
        this.ui = uiManager;
        this.reset();
    }

    reset() {
        this.state = {
            category: null,
            maxRounds: 10,
            currentRound: 0,
            score: 0,
            streak: 0,
            maxStreak: 0,
            mistakes: [],
            availablePool: [], // characters remaining to be correct answers
            fullPool: [], // all characters in category for options
            currentQuestion: null,
            isActive: false
        };
    }

    start(category, roundsStr) {
        this.reset();
        this.state.category = category;
        this.state.fullPool = this.store.getCharacters(category);
        this.state.availablePool = [...this.state.fullPool];
        
        if (this.state.fullPool.length < 3) {
            this.ui.showToast('Not enough characters in this category. Minimum 3 required.', 'error');
            return false;
        }

        // Shuffle pool
        this.state.availablePool.sort(() => Math.random() - 0.5);
        
        if (roundsStr === 'Infinite') {
            this.state.maxRounds = Infinity;
        } else {
            this.state.maxRounds = parseInt(roundsStr);
        }

        this.state.isActive = true;
        this.ui.navigate('game');
        this.nextRound();
        return true;
    }

    nextRound() {
        if (!this.state.isActive) return;
        
        if (this.state.currentRound >= this.state.maxRounds) {
            this.endGame();
            return;
        }

        this.state.currentRound++;
        
        // Refill pool if empty to allow rounds > characters
        if (this.state.availablePool.length === 0) {
            this.state.availablePool = [...this.state.fullPool].sort(() => Math.random() - 0.5);
        }

        // Pick correct answer
        const correctChar = this.state.availablePool.pop();
        
        // Pick 2 wrong options
        const wrongOptions = this.state.fullPool
            .filter(c => c.id !== correctChar.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 2);
            
        const options = [correctChar, ...wrongOptions].sort(() => Math.random() - 0.5);
        
        this.state.currentQuestion = {
            correct: correctChar,
            options: options
        };

        this.ui.renderGameRound(this.state);
    }

    handleAnswer(selectedId) {
        if (!this.state.isActive || !this.state.currentQuestion) return;
        
        const isCorrect = selectedId === this.state.currentQuestion.correct.id;
        const selectedChar = this.state.currentQuestion.options.find(o => o.id === selectedId);
        
        if (isCorrect) {
            this.state.score += 100 + (this.state.streak * 10);
            this.state.streak++;
            if (this.state.streak > this.state.maxStreak) {
                this.state.maxStreak = this.state.streak;
            }
        } else {
            this.state.streak = 0;
            const existingMistake = this.state.mistakes.find(m => m.correctId === this.state.currentQuestion.correct.id);
            if (!existingMistake) {
                this.state.mistakes.push({
                    correctId: this.state.currentQuestion.correct.id,
                    image: this.state.currentQuestion.correct.photoUrl,
                    correctName: this.state.currentQuestion.correct.name,
                    wrongName: selectedChar ? selectedChar.name : "Unknown"
                });
            }
        }

        this.ui.updateGameStats(this.state);
        this.ui.showAnswerFeedback(selectedId, this.state.currentQuestion.correct.id);
        
        setTimeout(() => {
            this.nextRound();
        }, 1200);
    }

    endGame() {
        this.state.isActive = false;
        const result = this.store.updateHighScore(this.state.category, this.state.score, this.state.maxStreak);
        this.ui.renderResults(this.state, result);
        this.ui.navigate('results');
        
        if (result.isNewHigh && this.state.score > 0) {
            Confetti.fire();
        }
    }
}

// --- App / UI Manager ---
class App {
    constructor() {
        this.store = new DataStore();
        this.game = new GameEngine(this.store, this);
        this.currentScreen = 'home';
        this.theme = localStorage.getItem('charquiz_theme') || 'dark';
        this.galleryFilter = 'All';
        this.labelsFilter = 'All';
        this.gallerySearch = '';
        
        this.initDOM();
        this.bindEvents();
        this.applyTheme(this.theme);
        Confetti.init();
        
        // Start Initialization flow
        this.initData();
    }

    async initData() {
        this.showToast('Connecting to KV database... ⏳', 'success');
        await this.store.loadCharacters();
        this.renderHome();
        this.showToast('Online Data Sync Complete! ✅', 'success');
    }

    initDOM() {
        // Screens
        this.screens = {
            home: document.getElementById('screen-home'),
            gallery: document.getElementById('screen-gallery'),
            config: document.getElementById('screen-config'),
            game: document.getElementById('screen-game'),
            results: document.getElementById('screen-results')
        };
        
        // Modals
        this.modals = {
            manager: document.getElementById('managerModal'),
            edit: document.getElementById('editModal'),
            image: document.getElementById('imageModal'),
            random: document.getElementById('randomModal'),
            labelsManager: document.getElementById('labelsManagerModal')
        };
        
        this.toastContainer = document.getElementById('toastContainer');
    }

    bindEvents() {
        // Mobile Menu Toggle
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const navLinks = document.getElementById('navLinks');
        if (mobileMenuBtn && navLinks) {
            mobileMenuBtn.addEventListener('click', () => {
                navLinks.classList.toggle('active');
            });
            
            navLinks.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    navLinks.classList.remove('active');
                });
            });
        }

        // Global Navigation
        document.querySelectorAll('.nav-btn, .logo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (target) this.navigate(target);
            });
        });

        // Manage Labels Modal
        const manageLabelsBtn = document.getElementById('manageLabelsBtn');
        if (manageLabelsBtn) manageLabelsBtn.addEventListener('click', () => {
            this.renderLabelsManager();
            this.openModal('labelsManager');
        });
        document.getElementById('closeLabelsManagerModal').addEventListener('click', () => this.closeModal('labelsManager'));
        document.getElementById('labelsManagerModalBackdrop').addEventListener('click', () => this.closeModal('labelsManager'));
        
        document.getElementById('addLabelForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('newLabelInput');
            if (this.store.addLabel(input.value)) {
                this.showToast('Label added');
                input.value = '';
                this.renderLabelsManager();
                // refresh gallery labels if open
                if (!this.screens.gallery.classList.contains('hidden')) this.renderGallery();
            } else {
                this.showToast('Invalid or duplicate label', 'error');
            }
        });

        // Sync Data Action
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                const origText = syncBtn.textContent;
                syncBtn.textContent = 'Syncing...';
                syncBtn.disabled = true;
                await this.initData();
                syncBtn.textContent = origText;
                syncBtn.disabled = false;
            });
        }

        // Theme Toggle
        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            this.applyTheme(this.theme);
            localStorage.setItem('charquiz_theme', this.theme);
        });

        // Global Image Modal
        document.body.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG' && 
                !e.target.closest('#managerCharacterList') && 
                !e.target.closest('.mistake-item') &&
                e.target.id !== 'randomModalImage' &&
                e.target.id !== 'globalModalImage') {
                // Ensure it has a src
                if (e.target.src) this.openImageModal(e.target.src);
            }
        });
        document.getElementById('closeImageModal').addEventListener('click', () => this.closeModal('image'));
        document.getElementById('imageModalBackdrop').addEventListener('click', () => this.closeModal('image'));
        document.getElementById('globalModalImage').addEventListener('click', () => this.closeModal('image'));

        // Random Character Modal
        const handleRandomRoll = () => {
            const allChars = this.store.getCharacters();
            if (allChars.length === 0) {
                this.showToast('No characters available. Add some first!', 'error');
                return;
            }
            const randomChar = allChars[Math.floor(Math.random() * allChars.length)];
            document.getElementById('randomModalImage').src = getProxiedUrl(randomChar.photoUrl);
            document.getElementById('randomModalName').textContent = randomChar.name;
            document.getElementById('randomModalCategory').textContent = randomChar.category;
            this.openModal('random');
        };

        const randomBtn = document.getElementById('randomCharBtn');
        if (randomBtn) randomBtn.addEventListener('click', handleRandomRoll);
        
        document.getElementById('randomCharRollBtn').addEventListener('click', handleRandomRoll);
        document.getElementById('closeRandomModal').addEventListener('click', () => this.closeModal('random'));
        document.getElementById('randomModalBackdrop').addEventListener('click', () => this.closeModal('random'));

        // Manager Modal
        document.getElementById('openManagerBtn').addEventListener('click', () => {
            const lastCategory = localStorage.getItem('charquiz_last_category');
            if (lastCategory) {
                const addCategorySelect = document.getElementById('addCategory');
                if ([...addCategorySelect.options].some(opt => opt.value === lastCategory)) {
                    addCategorySelect.value = lastCategory;
                }
            }
            this.renderLabelSelector('addLabelsContainer', []);
            this.openModal('manager');
        });
        document.getElementById('closeManagerModal').addEventListener('click', () => this.closeModal('manager'));
        document.getElementById('managerModalBackdrop').addEventListener('click', () => this.closeModal('manager'));

        // Edit Modal
        document.getElementById('closeEditModal').addEventListener('click', () => this.closeModal('edit'));
        document.getElementById('editModalBackdrop').addEventListener('click', () => this.closeModal('edit'));

        // Image Preview Buttons
        const setupPreviewBtn = (inputId, btnId) => {
            const input = document.getElementById(inputId);
            const btn = document.getElementById(btnId);
            if (input && btn) {
                const updateLink = () => {
                    if (input.value.trim()) {
                        btn.href = input.value.trim();
                    } else {
                        btn.href = '#';
                    }
                };
                input.addEventListener('input', updateLink);
                btn.addEventListener('click', (e) => {
                    if (!input.value.trim()) {
                        e.preventDefault();
                        this.showToast('Please enter an image URL first', 'error');
                    }
                });
            }
        };
        setupPreviewBtn('addUrl', 'addUrlPreviewBtn');
        setupPreviewBtn('editUrl', 'editUrlPreviewBtn');

        // CRUD Actions
        document.getElementById('addCharacterForm').addEventListener('submit', (e) => this.handleAddCharacter(e));
        document.getElementById('editCharacterForm').addEventListener('submit', (e) => this.handleEditCharacter(e));
        document.getElementById('exportDataBtn').addEventListener('click', () => this.store.exportData());
        document.getElementById('importDataInput').addEventListener('change', (e) => this.handleImportData(e));

        // Home Screen
        document.getElementById('homeCategoryGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.category-card');
            if (card) {
                const category = card.dataset.category;
                this.openGameConfig(category);
            }
        });

        // Gallery Filters
        document.getElementById('gallerySearch').addEventListener('input', (e) => {
            this.gallerySearch = e.target.value.toLowerCase();
            this.renderGallery();
        });
        document.getElementById('galleryFilters').addEventListener('click', (e) => {
            if (e.target.classList.contains('pill')) {
                document.querySelectorAll('#galleryFilters .pill').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                this.galleryFilter = e.target.dataset.filter;
                this.renderGallery();
            }
        });
        document.getElementById('galleryLabelFilters').addEventListener('click', (e) => {
            if (e.target.classList.contains('pill')) {
                document.querySelectorAll('#galleryLabelFilters .pill').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                this.labelsFilter = e.target.dataset.label;
                this.renderGallery();
            }
        });

        // Game Config
        document.getElementById('startGameBtn').addEventListener('click', () => {
            const roundsStr = document.querySelector('input[name="rounds"]:checked').value;
            const cat = document.getElementById('configCategoryTitle').dataset.category;
            this.game.start(cat, roundsStr);
        });
        document.getElementById('backFromConfigBtn').addEventListener('click', () => {
            this.navigate('home');
        });

        // Gameplay
        document.getElementById('gameOptions').addEventListener('click', (e) => {
            const btn = e.target.closest('.opt-btn');
            if (btn && !btn.disabled) {
                // Disable all to prevent double clicks
                document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
                this.game.handleAnswer(btn.dataset.id);
            }
        });
        document.getElementById('endGameBtn').addEventListener('click', () => {
             // End the game instantly and go to results
             if (this.game.state.isActive) {
                 this.game.endGame();
             }
        });

        // Results
        document.getElementById('playAgainBtn').addEventListener('click', () => this.navigate('home'));
    }

    applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('theme-dark');
            document.getElementById('themeToggleBtn').textContent = '☀️';
        } else {
            document.body.classList.remove('theme-dark');
            document.getElementById('themeToggleBtn').textContent = '🌙';
        }
    }

    navigate(screenId) {
        Object.values(this.screens).forEach(screen => {
            if (screen) screen.classList.add('hidden');
        });
        this.screens[screenId].classList.remove('hidden');

        if (screenId === 'home') this.renderHome();
        if (screenId === 'gallery') this.renderGallery();
    }

    openModal(modalId) {
        this.modals[modalId].classList.remove('hidden');
    }

    closeModal(modalId) {
        this.modals[modalId].classList.add('hidden');
    }

    openImageModal(src) {
        document.getElementById('globalModalImage').src = src;
        this.openModal('image');
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✅' : '❌'}</span>
            <span>${message}</span>
        `;
        this.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- Rendering Methods ---

    renderHome() {
        const grid = document.getElementById('homeCategoryGrid');
        grid.innerHTML = '';
        
        const categories = [...CATEGORIES, 'Mix'];
        
        categories.forEach(cat => {
            const chars = this.store.getCharacters(cat);
            let bgUrl = '';
            if (chars.length > 0) {
                // Pick random bg and proxy it
                bgUrl = getProxiedUrl(chars[Math.floor(Math.random() * chars.length)].photoUrl);
            } else {
                bgUrl = 'https://via.placeholder.com/300x400/222/555?text=' + cat;
            }

            const card = document.createElement('div');
            card.className = 'category-card';
            card.dataset.category = cat;
            card.innerHTML = `
                <div class="card-bg" style="background-image: url('${bgUrl}')"></div>
                <div class="card-overlay">
                    <h3>${cat}</h3>
                    <span class="count">${chars.length} Characters</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    renderGallery() {
        const grid = document.getElementById('galleryGrid');
        const filterContainer = document.getElementById('galleryLabelFilters');
        grid.innerHTML = '';
        
        const allChars = this.store.getCharacters();
        // Collect all unique labels
        const uniqueLabels = new Set();
        allChars.forEach(c => {
            if (Array.isArray(c.labels)) {
                c.labels.forEach(l => uniqueLabels.add(l));
            }
        });
        
        // Render Label Filter Pills
        const sortedLabels = Array.from(uniqueLabels).sort();
        let labelsHtml = `<button class="pill ${this.labelsFilter === 'All' ? 'active' : ''}" data-label="All">Any Label</button>`;
        sortedLabels.forEach(label => {
            labelsHtml += `<button class="pill ${this.labelsFilter === label ? 'active' : ''}" data-label="${label}">${label}</button>`;
        });
        filterContainer.innerHTML = labelsHtml;
        // Hide container if there are no labels
        filterContainer.style.display = sortedLabels.length > 0 ? 'flex' : 'none';

        // Filter Characters
        const chars = this.store.getCharacters(this.galleryFilter).filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(this.gallerySearch);
            const matchesLabel = this.labelsFilter === 'All' || (Array.isArray(c.labels) && c.labels.includes(this.labelsFilter));
            return matchesSearch && matchesLabel;
        });

        if (chars.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted)">No characters found.</p>`;
            return;
        }

        chars.forEach(c => {
            const item = document.createElement('div');
            item.className = 'char-item';
            item.innerHTML = `
                <img src="${getProxiedUrl(c.photoUrl)}" loading="lazy" alt="${c.name}">
                <div class="char-item-actions">
                    <button class="char-action-btn edit" onclick="app.openEditModal('${c.id}', event)" title="Edit">✏️</button>
                    <button class="char-action-btn delete" onclick="app.handleDeleteCharacter('${c.id}', event)" title="Delete">🗑️</button>
                </div>
                <div class="char-item-info">
                    <strong>${c.name}</strong>
                    <span>${c.category}</span>
                    ${Array.isArray(c.labels) && c.labels.length > 0 ? 
                        `<div class="char-item-labels">${c.labels.map(l => `<span class="char-label">${l}</span>`).join('')}</div>` : ''}
                </div>
            `;
            grid.appendChild(item);
        });
    }

    openEditModal(id, e) {
        if (e) e.stopPropagation();
        const char = this.store.getCharacters().find(c => c.id === id);
        if (!char) return;

        document.getElementById('editId').value = char.id;
        document.getElementById('editName').value = char.name;
        document.getElementById('editCategory').value = char.category;
        document.getElementById('editUrl').value = char.photoUrl;

        this.renderLabelSelector('editLabelsContainer', char.labels || []);

        this.openModal('edit');
    }

    openGameConfig(category) {
        const chars = this.store.getCharacters(category);
        if (chars.length < 3) {
            this.showToast(`Need at least 3 characters in ${category} to play. Currently have ${chars.length}.`, 'error');
            return;
        }
        
        const title = document.getElementById('configCategoryTitle');
        title.textContent = `${category} Mode`;
        title.dataset.category = category;
        
        // Ensure all round options are enabled
        document.querySelectorAll('input[name="rounds"]').forEach(input => {
            input.disabled = false;
            input.parentElement.style.opacity = '1';
            input.parentElement.style.pointerEvents = 'auto';
        });
        
        // Auto select a logical default option
        const tenOption = document.querySelector('input[name="rounds"][value="10"]');
        if (tenOption) {
            tenOption.checked = true;
        } else {
            const firstValid = document.querySelector('input[name="rounds"]');
            if (firstValid) firstValid.checked = true;
        }

        this.navigate('config');
    }

    renderGameRound(state) {
        document.getElementById('currentRound').textContent = state.maxRounds === Infinity ? 
            state.currentRound : `${state.currentRound} / ${state.maxRounds}`;
        document.getElementById('currentStreak').textContent = state.streak;
        
        let progress = 0;
        if (state.maxRounds !== Infinity) {
            progress = ((state.currentRound - 1) / state.maxRounds) * 100;
        }
        document.getElementById('gameProgressFill').style.width = `${progress}%`;
        
        const img = document.getElementById('gameImage');
        img.src = getProxiedUrl(state.currentQuestion.correct.photoUrl);
        
        const optsContainer = document.getElementById('gameOptions');
        optsContainer.innerHTML = '';
        
        state.currentQuestion.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'opt-btn';
            btn.dataset.id = opt.id;
            btn.textContent = opt.name;
            optsContainer.appendChild(btn);
        });
    }

    updateGameStats(state) {
        document.getElementById('currentStreak').textContent = state.streak;
        
        let progress = 0;
        if (state.maxRounds !== Infinity) {
            progress = (state.currentRound / state.maxRounds) * 100;
        }
        document.getElementById('gameProgressFill').style.width = `${progress}%`;
    }

    showAnswerFeedback(selectedId, correctId) {
        document.querySelectorAll('.opt-btn').forEach(btn => {
            if (btn.dataset.id === correctId) {
                btn.classList.add('correct');
            } else if (btn.dataset.id === selectedId) {
                btn.classList.add('incorrect');
            }
        });
    }

    renderResults(state, resultInfo) {
        document.getElementById('finalScore').textContent = state.score;
        document.getElementById('maxStreak').textContent = state.maxStreak;
        document.getElementById('highScore').textContent = resultInfo.record.score;
        
        const label = resultInfo.isNewHigh ? '🏆 New' : 'All-Time';
        document.querySelector('.metric.highlight span').innerHTML = `${label} High Score`;

        const mistakesList = document.getElementById('mistakesList');
        mistakesList.innerHTML = '';
        
        if (state.mistakes.length === 0) {
            mistakesList.innerHTML = '<p style="color:var(--success)">Perfect game! No mistakes to review.</p>';
        } else {
            state.mistakes.forEach(m => {
                const item = document.createElement('div');
                item.className = 'mistake-item';
                item.innerHTML = `
                    <img src="${getProxiedUrl(m.image)}" alt="Character">
                    <div class="mistake-info">
                        <span class="wrong">${m.wrongName}</span>
                        <span class="right">${m.correctName}</span>
                    </div>
                `;
                mistakesList.appendChild(item);
            });
        }
    }

    renderLabelSelector(containerId, activeLabels) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        const allLabels = this.store.customLabels;
        
        if (allLabels.length === 0) {
            container.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted);">No labels created. Manage them in Gallery.</span>';
            return;
        }

        allLabels.forEach(label => {
            const isChecked = activeLabels.includes(label);
            const labelEl = document.createElement('label');
            labelEl.className = 'label-cb-pill';
            labelEl.innerHTML = `
                <input type="checkbox" value="${label}" ${isChecked ? 'checked' : ''} style="display:none;">
                <span>${label}</span>
            `;
            container.appendChild(labelEl);
        });
    }

    renderLabelsManager() {
        const list = document.getElementById('labelsManagerList');
        if (!list) return;
        
        list.innerHTML = '';
        const allLabels = this.store.customLabels;
        
        if (allLabels.length === 0) {
            list.innerHTML = '<span style="color: var(--text-muted); text-align: center; display: block; padding: 1rem;">No labels yet.</span>';
            return;
        }

        allLabels.forEach(label => {
            const item = document.createElement('div');
            item.className = 'label-manager-item';
            item.innerHTML = `
                <span>${label}</span>
                <button class="char-action-btn delete" data-label="${label}" title="Delete Label" style="width: 25px; height: 25px; font-size: 0.8rem;">&times;</button>
            `;
            list.appendChild(item);
        });

        // Bind delete buttons
        list.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const labelToDelete = e.target.dataset.label;
                if (confirm(`Delete label "${labelToDelete}"? This will not remove it from characters who already have it, but you won't be able to select it anymore.`)) {
                    this.store.deleteLabel(labelToDelete);
                    this.renderLabelsManager();
                    if (!this.screens.gallery.classList.contains('hidden')) this.renderGallery();
                }
            });
        });
    }

    // --- Action Handlers ---

    async handleAddCharacter(e) {
        e.preventDefault();
        const name = document.getElementById('addName').value;
        const category = document.getElementById('addCategory').value;
        const url = document.getElementById('addUrl').value;
        
        const labels = Array.from(document.querySelectorAll('#addLabelsContainer input[type="checkbox"]:checked')).map(cb => cb.value);

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        
        // Remember selection
        if (category) localStorage.setItem('charquiz_last_category', category);
        
        try {
            await this.store.addCharacter(name, category, url, labelsRaw);
            this.renderGallery();
            this.renderHome();
            this.closeModal('manager');
            this.showToast('Character saved to KV safely!');
            e.target.reset();
            document.getElementById('addUrlPreviewBtn').href = '#';
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    async handleEditCharacter(e) {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        const name = document.getElementById('editName').value;
        const category = document.getElementById('editCategory').value;
        const url = document.getElementById('editUrl').value;
        
        const labels = Array.from(document.querySelectorAll('#editLabelsContainer input[type="checkbox"]:checked')).map(cb => cb.value);

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        
        // Remember selection
        if (category) localStorage.setItem('charquiz_last_category', category);
        
        try {
            await this.store.updateCharacter(id, name, category, url, labelsRaw);
            this.renderGallery();
            this.renderHome();
            this.closeModal('edit');
            this.showToast('Character updated successfully!');
            e.target.reset();
            document.getElementById('editUrlPreviewBtn').href = '#';
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    async handleDeleteCharacter(id, e) {
        if (e) e.stopPropagation();
        if (confirm('Are you sure you want to permanently delete this character from the KV database?')) {
            try {
                this.showToast('Deleting character... ⏳');
                await this.store.deleteCharacter(id);
                this.renderGallery();
                this.renderHome();
                this.showToast('Character deleted safely from KV.');
            } catch (err) {
                this.showToast(err.message, 'error');
            }
        }
    }

    handleImportData(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        this.showToast('Importing to KV database... please wait.', 'success');
        
        this.store.importData(file, (count) => {
            this.renderGallery();
            this.renderHome();
            this.showToast(`Successfully uploaded ${count} new characters to Cloudflare KV!`);
            e.target.value = ''; // reset
        }, (err) => {
            this.showToast(`Import failed: ${err.message}`, 'error');
            e.target.value = '';
        });
    }
}

// Initialize App
const app = new App();
