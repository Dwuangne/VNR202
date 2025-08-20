/**
 * PDF Audio Storybook - Static Web Application
 * Features: PDF.js rendering, per-page audio, responsive design, accessibility
 */

// Initialize PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';

// Application State
class PDFStorybook {
    constructor() {
        this.config = null;
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.5;
        this.isRendering = false;
        this.pendingPage = null;
        this.audioEnabled = false;
        this.renderToken = 0;
        
        // DOM Elements
        this.canvas = document.getElementById('pdf-render');
        this.ctx = this.canvas.getContext('2d');
        this.audio = document.getElementById('audio-element');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.enableSoundOverlay = document.getElementById('enable-sound-overlay');
        
        // Prefetch storage
        this.prefetchedPages = new Map();
        this.prefetchedAudio = new Map();
        
        // Touch/swipe handling
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isSwiping = false;
        
        this.init();
    }

    async init() {
        try {
            await this.loadConfig();
            await this.loadPDF();
            this.setupEventListeners();
            this.loadSavedState();
            this.hideLoading();
        } catch (error) {
            this.showError('Không thể tải ứng dụng', error.message);
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('assets/config.json');
            if (!response.ok) throw new Error('Không thể tải config.json');
            
            this.config = await response.json();
            
            // Update UI with config
            document.getElementById('book-title').textContent = this.config.title || 'PDF Audio Storybook';
            
            // Setup audio defaults
            this.audio.muted = this.config.startMuted || false;
            this.updateMuteButton();
            
        } catch (error) {
            throw new Error(`Lỗi tải cấu hình: ${error.message}`);
        }
    }

    async loadPDF() {
        try {
            const loadingTask = pdfjsLib.getDocument(this.config.pdf);
            
            loadingTask.onProgress = (progress) => {
                if (progress.total) {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    this.updateLoadingProgress(`Đang tải PDF... ${percent}%`);
                }
            };
            
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            
            // Update UI
            document.getElementById('total-pages').textContent = `/ ${this.totalPages}`;
            document.getElementById('current-page').max = this.totalPages;
            
            // Render first page
            await this.renderPage(this.currentPage);
            
            // Start prefetching
            this.prefetchNextPage();
            
        } catch (error) {
            throw new Error(`Lỗi tải PDF: ${error.message}`);
        }
    }

    async renderPage(pageNum, forceRender = false) {
        if (this.isRendering && !forceRender) {
            this.pendingPage = pageNum;
            return;
        }

        this.isRendering = true;
        const currentToken = ++this.renderToken;

        try {
            // Check if page is already prefetched
            let page = this.prefetchedPages.get(pageNum);
            
            if (!page) {
                page = await this.pdfDoc.getPage(pageNum);
            }

            // Check if render was cancelled
            if (currentToken !== this.renderToken) {
                this.isRendering = false;
                return;
            }

            const viewport = page.getViewport({ scale: this.scale });
            
            // Set canvas dimensions
            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;
            
            // Update canvas container for responsive design
            this.updateCanvasContainer();

            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            // Check if render was cancelled
            if (currentToken !== this.renderToken) {
                this.isRendering = false;
                return;
            }

            this.currentPage = pageNum;
            this.updatePageDisplay();
            this.handlePageAudio();
            this.saveCurrentState();
            
            // Prefetch next page
            this.prefetchNextPage();

        } catch (error) {
            console.error('Render error:', error);
            this.showToast('Lỗi hiển thị trang', 'error');
        } finally {
            this.isRendering = false;
            
            // Handle pending render
            if (this.pendingPage !== null && this.pendingPage !== pageNum) {
                const nextPage = this.pendingPage;
                this.pendingPage = null;
                this.renderPage(nextPage);
            }
        }
    }

    updateCanvasContainer() {
        const container = document.getElementById('canvas-container');
        const maxWidth = window.innerWidth - 40; // Account for padding
        const maxHeight = window.innerHeight - 300; // Account for header/footer
        
        if (this.canvas.width > maxWidth) {
            container.style.width = maxWidth + 'px';
        } else {
            container.style.width = 'auto';
        }
        
        if (this.canvas.height > maxHeight) {
            container.style.maxHeight = maxHeight + 'px';
        } else {
            container.style.maxHeight = 'none';
        }
    }

    updatePageDisplay() {
        document.getElementById('current-page').value = this.currentPage;
        this.updatePageInfo();
        this.updateNavigationButtons();
        this.updateZoomDisplay();
    }

    updatePageInfo() {
        const pageConfig = this.config.pages?.[this.currentPage];
        const titleElement = document.getElementById('page-title');
        const descElement = document.getElementById('page-description');
        
        if (pageConfig) {
            titleElement.textContent = pageConfig.title || `Trang ${this.currentPage}`;
            descElement.textContent = pageConfig.description || '';
        } else {
            titleElement.textContent = `Trang ${this.currentPage}`;
            descElement.textContent = '';
        }
    }

    updateNavigationButtons() {
        document.getElementById('prev-page').disabled = this.currentPage <= 1;
        document.getElementById('next-page').disabled = this.currentPage >= this.totalPages;
    }

    updateZoomDisplay() {
        const zoomPercent = Math.round(this.scale * 100);
        document.getElementById('zoom-level').textContent = `${zoomPercent}%`;
    }

    async handlePageAudio() {
        // Stop current audio
        this.stopAudio();
        
        const pageConfig = this.config.pages?.[this.currentPage];
        
        if (pageConfig?.audio) {
            try {
                // Check if audio is prefetched
                let audioSrc = pageConfig.audio;
                
                this.audio.src = audioSrc;
                await this.loadAudio();
                
                // Auto-play if enabled and allowed
                if (this.audioEnabled && !this.audio.muted && this.config.autoplay) {
                    try {
                        await this.audio.play();
                        this.updatePlayButton(true);
                    } catch (error) {
                        console.log('Autoplay prevented:', error);
                        this.showEnableSoundOverlay();
                    }
                }
                
            } catch (error) {
                console.error('Audio loading error:', error);
                this.showToast('Không thể tải âm thanh cho trang này', 'warning');
            }
        } else {
            this.showToast('Trang này không có âm thanh', 'info');
            this.updatePlayButton(false);
        }
        
        // Prefetch next audio
        this.prefetchNextAudio();
    }

    loadAudio() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Audio load timeout'));
            }, 10000);
            
            const cleanup = () => {
                clearTimeout(timeout);
                this.audio.removeEventListener('canplay', onCanPlay);
                this.audio.removeEventListener('error', onError);
            };
            
            const onCanPlay = () => {
                cleanup();
                resolve();
            };
            
            const onError = () => {
                cleanup();
                reject(new Error('Audio load failed'));
            };
            
            this.audio.addEventListener('canplay', onCanPlay);
            this.audio.addEventListener('error', onError);
            
            this.audio.load();
        });
    }

    stopAudio() {
        if (!this.audio.paused) {
            this.audio.pause();
        }
        this.audio.currentTime = 0;
        this.updatePlayButton(false);
    }

    // Prefetching methods
    async prefetchNextPage() {
        const nextPageNum = this.currentPage + 1;
        if (nextPageNum <= this.totalPages && !this.prefetchedPages.has(nextPageNum)) {
            try {
                const page = await this.pdfDoc.getPage(nextPageNum);
                this.prefetchedPages.set(nextPageNum, page);
                
                // Limit cache size
                if (this.prefetchedPages.size > 3) {
                    const firstKey = this.prefetchedPages.keys().next().value;
                    this.prefetchedPages.delete(firstKey);
                }
            } catch (error) {
                console.log('Prefetch page error:', error);
            }
        }
    }

    prefetchNextAudio() {
        const nextPageNum = this.currentPage + 1;
        const nextPageConfig = this.config.pages?.[nextPageNum];
        
        if (nextPageConfig?.audio && !this.prefetchedAudio.has(nextPageNum)) {
            try {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.src = nextPageConfig.audio;
                this.prefetchedAudio.set(nextPageNum, audio);
                
                // Limit cache size
                if (this.prefetchedAudio.size > 3) {
                    const firstKey = this.prefetchedAudio.keys().next().value;
                    this.prefetchedAudio.delete(firstKey);
                }
            } catch (error) {
                console.log('Prefetch audio error:', error);
            }
        }
    }

    // Navigation methods
    goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;
        this.renderPage(pageNum);
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    // Zoom methods
    zoomIn() {
        this.scale = Math.min(this.scale + 0.25, 3);
        this.renderPage(this.currentPage, true);
    }

    zoomOut() {
        this.scale = Math.max(this.scale - 0.25, 0.5);
        this.renderPage(this.currentPage, true);
    }

    // Audio control methods
    togglePlayPause() {
        if (!this.audio.src) {
            this.showToast('Không có âm thanh để phát', 'warning');
            return;
        }

        if (this.audio.paused) {
            this.audio.play().catch(error => {
                console.error('Play error:', error);
                if (!this.audioEnabled) {
                    this.showEnableSoundOverlay();
                }
            });
        } else {
            this.audio.pause();
        }
    }

    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.updateMuteButton();
        this.saveCurrentState();
    }

    updatePlayButton(isPlaying) {
        const playIcon = document.querySelector('.play-icon');
        const pauseIcon = document.querySelector('.pause-icon');
        
        if (isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }

    updateMuteButton() {
        const muteIcon = document.querySelector('.mute-icon');
        const unmuteIcon = document.querySelector('.unmute-icon');
        
        if (this.audio.muted) {
            muteIcon.style.display = 'block';
            unmuteIcon.style.display = 'none';
        } else {
            muteIcon.style.display = 'none';
            unmuteIcon.style.display = 'block';
        }
    }

    // Event Handlers
    setupEventListeners() {
        // Navigation buttons
        document.getElementById('prev-page').addEventListener('click', () => this.prevPage());
        document.getElementById('next-page').addEventListener('click', () => this.nextPage());
        
        // Page input
        const pageInput = document.getElementById('current-page');
        pageInput.addEventListener('change', (e) => {
            const pageNum = parseInt(e.target.value);
            if (pageNum >= 1 && pageNum <= this.totalPages) {
                this.goToPage(pageNum);
            } else {
                e.target.value = this.currentPage;
            }
        });
        
        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        
        // Audio controls
        document.getElementById('play-pause').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('mute-unmute').addEventListener('click', () => this.toggleMute());
        
        // Enable sound overlay
        document.getElementById('enable-sound').addEventListener('click', () => {
            this.enableAudio();
        });
        
        // Progress bar
        const progressBar = document.getElementById('progress-bar');
        progressBar.addEventListener('input', (e) => {
            if (this.audio.duration) {
                const seekTime = (this.audio.duration / 100) * e.target.value;
                this.audio.currentTime = seekTime;
            }
        });
        
        // Audio events
        this.audio.addEventListener('play', () => this.updatePlayButton(true));
        this.audio.addEventListener('pause', () => this.updatePlayButton(false));
        this.audio.addEventListener('ended', () => {
            this.updatePlayButton(false);
            if (this.config.loop) {
                this.audio.currentTime = 0;
                this.audio.play();
            }
        });
        
        this.audio.addEventListener('timeupdate', () => this.updateAudioProgress());
        this.audio.addEventListener('durationchange', () => this.updateAudioDuration());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Touch/swipe events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Resize events
        window.addEventListener('resize', () => this.updateCanvasContainer());
        
        // Visibility change (for pausing audio when tab is hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this.audio.paused) {
                this.audio.pause();
            }
        });
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;
        
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.prevPage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextPage();
                break;
            case ' ':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                this.toggleMute();
                break;
            case '+':
            case '=':
                e.preventDefault();
                this.zoomIn();
                break;
            case '-':
                e.preventDefault();
                this.zoomOut();
                break;
        }
    }

    // Touch/Swipe handling
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.isSwiping = false;
        }
    }

    handleTouchMove(e) {
        if (e.touches.length === 1) {
            const deltaX = Math.abs(e.touches[0].clientX - this.touchStartX);
            const deltaY = Math.abs(e.touches[0].clientY - this.touchStartY);
            
            if (deltaX > 10 || deltaY > 10) {
                this.isSwiping = true;
            }
        }
    }

    handleTouchEnd(e) {
        if (this.isSwiping && e.changedTouches.length === 1) {
            const deltaX = e.changedTouches[0].clientX - this.touchStartX;
            const deltaY = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
            
            // Horizontal swipe
            if (Math.abs(deltaX) > 50 && deltaY < 100) {
                if (deltaX > 0) {
                    this.prevPage(); // Swipe right = previous page
                } else {
                    this.nextPage(); // Swipe left = next page
                }
            }
        }
        
        this.isSwiping = false;
    }

    updateAudioProgress() {
        if (this.audio.duration) {
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            document.getElementById('progress-bar').value = progress;
            document.getElementById('current-time').textContent = this.formatTime(this.audio.currentTime);
        }
    }

    updateAudioDuration() {
        if (this.audio.duration) {
            document.getElementById('duration').textContent = this.formatTime(this.audio.duration);
        }
    }

    formatTime(seconds) {
        if (!isFinite(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // UI Helper methods
    enableAudio() {
        this.audioEnabled = true;
        this.hideEnableSoundOverlay();
        
        // Try to play current audio if available
        if (this.audio.src && this.audio.paused) {
            this.audio.play().catch(console.error);
        }
    }

    showEnableSoundOverlay() {
        this.enableSoundOverlay.style.display = 'flex';
    }

    hideEnableSoundOverlay() {
        this.enableSoundOverlay.style.display = 'none';
    }

    hideLoading() {
        this.loadingSpinner.style.display = 'none';
    }

    updateLoadingProgress(message) {
        const loadingText = this.loadingSpinner.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const container = document.getElementById('toast-container');
        container.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    showError(title, message) {
        const errorDisplay = document.getElementById('error-display');
        document.getElementById('error-message').textContent = message;
        errorDisplay.style.display = 'block';
        
        document.getElementById('retry-button').onclick = () => {
            errorDisplay.style.display = 'none';
            location.reload();
        };
        
        this.hideLoading();
    }

    // State persistence
    saveCurrentState() {
        const state = {
            currentPage: this.currentPage,
            muted: this.audio.muted,
            scale: this.scale,
            timestamp: Date.now()
        };
        
        localStorage.setItem('pdf-storybook-state', JSON.stringify(state));
    }

    loadSavedState() {
        try {
            const saved = localStorage.getItem('pdf-storybook-state');
            if (saved) {
                const state = JSON.parse(saved);
                
                // Only restore if saved recently (within 7 days)
                if (Date.now() - state.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    if (state.currentPage && state.currentPage <= this.totalPages) {
                        this.goToPage(state.currentPage);
                    }
                    
                    if (typeof state.muted === 'boolean') {
                        this.audio.muted = state.muted;
                        this.updateMuteButton();
                    }
                    
                    if (state.scale) {
                        this.scale = state.scale;
                        this.updateZoomDisplay();
                    }
                }
            }
        } catch (error) {
            console.log('Error loading saved state:', error);
        }
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PDFStorybook();
});
