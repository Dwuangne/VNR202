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
        this.audioMap = null;
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.5;
        this.isRendering = false;
        this.pendingPage = null;
        this.audioEnabled = false;
        this.renderToken = 0;
        
        // DOM Elements
        this.canvasSingle = document.getElementById('pdf-render-single');
        this.canvasLeft = document.getElementById('pdf-render-left');
        this.canvasRight = document.getElementById('pdf-render-right');
        this.ctxSingle = this.canvasSingle?.getContext('2d');
        this.ctxLeft = this.canvasLeft?.getContext('2d');
        this.ctxRight = this.canvasRight?.getContext('2d');
        
        this.singleView = document.getElementById('single-view');
        this.spreadView = document.getElementById('spread-view');
        this.pageLoading = document.getElementById('page-loading');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        this.zoomLevel = document.getElementById('zoom-level');
        
        this.audio = document.getElementById('audio-element');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.enableSoundOverlay = document.getElementById('enable-sound-overlay');
        // New progress elements
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        
        // Book layout state
        this.isBookMode = true; // true = book layout, false = single page
        this.currentSpread = 1; // Current spread number (1 = page 1, 2 = pages 2-3, etc.)
        
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
            await this.loadAudioMap();
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
            const bookTitle = document.getElementById('book-title');
            if (bookTitle) {
                bookTitle.textContent = this.config.title || 'PDF Audio Storybook';
            }
            
            // Setup audio defaults
            this.audio.muted = this.config.startMuted || false;
            this.updateMuteButton();
            
        } catch (error) {
            throw new Error(`Lỗi tải cấu hình: ${error.message}`);
        }
    }

    async loadAudioMap() {
        try {
            const response = await fetch('assets/config/audio-map.json');
            if (!response.ok) throw new Error('Không thể tải audio-map.json');
            this.audioMap = await response.json();
        } catch (error) {
            // Audio map is optional, but recommended
            console.warn('Audio map load warning:', error.message);
            this.audioMap = null;
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
            
            // Update UI - simplified
            document.title = this.config.title || 'PDF Audio Storybook';
            
            // Initialize zoom display and render first page
            this.updateZoomDisplay();
            this.updateZoomButtons();
            await this.renderPage(this.currentPage);
            
            // Start prefetching
            this.prefetchPagesAround(this.currentPage, 2);
            
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
            this.currentPage = pageNum;
            this.currentSpread = this.calculateSpread(pageNum);
            
            // Determine layout: single page (page 1 or last even page) or dual page
            const isFirstPage = pageNum === 1;
            const isLastEvenPage = pageNum === this.totalPages && pageNum % 2 === 0;
            const isSinglePage = isFirstPage || isLastEvenPage;
            
            if (isSinglePage) {
                await this.renderSinglePage(pageNum, currentToken);
            } else {
                await this.renderDualPage(pageNum, currentToken);
            }

            // Check if render was cancelled
            if (currentToken !== this.renderToken) {
                this.isRendering = false;
                return;
            }

            this.updatePageDisplay();
            this.handlePageAudio();
            this.saveCurrentState();
            
            // Prefetch next pages
            this.prefetchPagesAround(this.currentPage, 2);

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

    calculateSpread(pageNum) {
        if (pageNum === 1) return 1;
        return Math.ceil((pageNum - 1) / 2) + 1;
    }

    async renderSinglePage(pageNum, currentToken) {
        // Show single page view, hide spread view
        if (this.singleView) this.singleView.style.display = 'block';
        if (this.spreadView) this.spreadView.style.display = 'none';
        if (this.pageLoading) this.pageLoading.style.display = 'none';

        let page = this.prefetchedPages.get(pageNum);
        if (!page) {
            page = await this.pdfDoc.getPage(pageNum);
        }

        // Check if render was cancelled
        if (currentToken !== this.renderToken) return;

        const viewport = page.getViewport({ scale: this.scale });
        
        // Set canvas dimensions
        this.canvasSingle.height = viewport.height;
        this.canvasSingle.width = viewport.width;
        
        this.updateCanvasContainer();

        const renderContext = {
            canvasContext: this.ctxSingle,
            viewport: viewport
        };

        await page.render(renderContext).promise;
    }

    async renderDualPage(pageNum, currentToken) {
        // Check if this is the last page and it's even (should be single)
        if (pageNum === this.totalPages && pageNum % 2 === 0) {
            await this.renderSinglePage(pageNum, currentToken);
            return;
        }

        // Show spread view, hide single view
        if (this.singleView) this.singleView.style.display = 'none';
        if (this.spreadView) this.spreadView.style.display = 'flex';
        if (this.pageLoading) this.pageLoading.style.display = 'none';

        // Calculate left and right page numbers for book spreads
        let leftPageNum, rightPageNum;
        
        // Book spread logic: 2-3, 4-5, 6-7, etc.
        if (pageNum === 2 || pageNum === 3) {
            leftPageNum = 2;
            rightPageNum = 3;
        } else if (pageNum === 4 || pageNum === 5) {
            leftPageNum = 4;
            rightPageNum = 5;
        } else if (pageNum === 6 || pageNum === 7) {
            leftPageNum = 6;
            rightPageNum = 7;
        } else {
            // General case for larger books
            const spreadStart = Math.floor((pageNum - 2) / 2) * 2 + 2;
            leftPageNum = spreadStart;
            rightPageNum = spreadStart + 1;
        }

        // Render both pages
        const promises = [];
        
        if (leftPageNum >= 1 && leftPageNum <= this.totalPages) {
            promises.push(this.renderPageOnCanvas(leftPageNum, this.canvasLeft, this.ctxLeft, currentToken));
        } else {
            // Clear left canvas if no page
            this.ctxLeft.clearRect(0, 0, this.canvasLeft.width, this.canvasLeft.height);
        }
        
        if (rightPageNum >= 1 && rightPageNum <= this.totalPages) {
            promises.push(this.renderPageOnCanvas(rightPageNum, this.canvasRight, this.ctxRight, currentToken));
        } else {
            // Clear right canvas if no page
            this.ctxRight.clearRect(0, 0, this.canvasRight.width, this.canvasRight.height);
        }

        await Promise.all(promises);
        this.updateCanvasContainer();
    }

    async renderPageOnCanvas(pageNum, canvas, ctx, currentToken) {
        let page = this.prefetchedPages.get(pageNum);
        if (!page) {
            page = await this.pdfDoc.getPage(pageNum);
        }

        // Check if render was cancelled
        if (currentToken !== this.renderToken) return;

        const viewport = page.getViewport({ scale: this.scale });
        
        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        await page.render(renderContext).promise;
    }

    updateCanvasContainer() {
        // Auto-scaling is now handled by CSS
        // This method can be used for additional responsive adjustments if needed
    }

    updatePageDisplay() {
        this.updateNavigationButtons();
        this.updateProgress();
        this.updateZoomDisplay();
        this.updateZoomButtons();
    }

    // Removed spread info display

    // Removed page info display

    updateNavigationButtons() {
        const prev = this.getPrevPageInBook();
        const next = this.getNextPageInBook();
        
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (prevBtn) {
            prevBtn.disabled = !prev || prev === this.currentPage;
        }
        
        if (nextBtn) {
            nextBtn.disabled = !next || next === this.currentPage;
        }
    }

    // Removed zoom display

    async handlePageAudio() {
        this.stopAudio();
        const pagesShown = this.getPagesShownFor(this.currentPage);
        await this.playSoundFor(pagesShown);
        this.prefetchNextAudio();
    }

    getPagesShownFor(pageNum) {
        // Cover or last-even single page
        const isFirstPage = pageNum === 1;
        const isLastEvenPage = pageNum === this.totalPages && this.totalPages % 2 === 0;
        if (isFirstPage || isLastEvenPage) return [pageNum];
        
        // Compute spread
        let leftPageNum, rightPageNum;
        if (pageNum === 2 || pageNum === 3) {
            leftPageNum = 2; rightPageNum = 3;
        } else if (pageNum === 4 || pageNum === 5) {
            leftPageNum = 4; rightPageNum = 5;
        } else if (pageNum === 6 || pageNum === 7) {
            leftPageNum = 6; rightPageNum = 7;
        } else {
            const spreadStart = Math.floor((pageNum - 2) / 2) * 2 + 2;
            leftPageNum = spreadStart;
            rightPageNum = spreadStart + 1;
        }
        
        const pages = [];
        if (leftPageNum >= 1 && leftPageNum <= this.totalPages) pages.push(leftPageNum);
        if (rightPageNum >= 1 && rightPageNum <= this.totalPages) pages.push(rightPageNum);
        return pages;
    }

    async playSoundFor(pagesShown) {
        try {
            let audioSrc = '';
            
            // Special last-even handling
            const isLastEven = (this.totalPages % 2 === 0) && pagesShown.length === 1 && pagesShown[0] === this.totalPages;
            
            if (this.audioMap && Array.isArray(this.audioMap.groups)) {
                if (isLastEven) {
                    const lastEvenGroup = this.audioMap.groups.find(g => 
                        Array.isArray(g.pages) && g.pages.includes('last-even')
                    );
                    if (lastEvenGroup && lastEvenGroup.audio) {
                        audioSrc = lastEvenGroup.audio;
                    }
                }
                
                if (!audioSrc) {
                    for (const group of this.audioMap.groups) {
                        if (!Array.isArray(group.pages) || !group.audio) continue;
                        const match = pagesShown.some(p => group.pages.includes(p));
                        if (match) {
                            audioSrc = group.audio;
                            break;
                        }
                    }
                }
            }
            
            if (!audioSrc && this.audioMap && this.audioMap.defaultFlipSound) {
                audioSrc = this.audioMap.defaultFlipSound;
            }
            
            if (!audioSrc) {
                this.updatePlayButton(false);
                return;
            }
            
            this.audio.src = audioSrc;
            await this.loadAudio();
            
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
    async prefetchPagesAround(pageNum, distance = 2) {
        const pagesToPrefetch = new Set();
        for (let d = 1; d <= distance; d++) {
            const p1 = pageNum + d;
            const p2 = pageNum - d;
            if (p1 >= 1 && p1 <= this.totalPages) pagesToPrefetch.add(p1);
            if (p2 >= 1 && p2 <= this.totalPages) pagesToPrefetch.add(p2);
        }
        
        for (const p of pagesToPrefetch) {
            if (!this.prefetchedPages.has(p)) {
                try {
                    const page = await this.pdfDoc.getPage(p);
                    this.prefetchedPages.set(p, page);
                    
                    if (this.prefetchedPages.size > 6) {
                        const firstKey = this.prefetchedPages.keys().next().value;
                        this.prefetchedPages.delete(firstKey);
                    }
                } catch (error) {
                    console.log('Prefetch page error:', error);
                }
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

    // Navigation methods with page flip animation
    goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;
        
        const isMovingForward = pageNum > this.currentPage;
        this.addPageFlipAnimation(isMovingForward);
        
        setTimeout(() => {
            this.renderPage(pageNum);
        }, 100); // Small delay for animation start
    }

    prevPage() {
        const prev = this.getPrevPageInBook();
        console.log(`Current: ${this.currentPage}, Prev: ${prev}`);
        if (prev && prev !== this.currentPage) {
            this.addPageFlipAnimation(false);
            setTimeout(() => this.renderPage(prev), 100);
        }
    }

    nextPage() {
        const next = this.getNextPageInBook();
        console.log(`Current: ${this.currentPage}, Next: ${next}`);
        if (next && next !== this.currentPage) {
            this.addPageFlipAnimation(true);
            setTimeout(() => this.renderPage(next), 100);
        }
    }

    getSpreadStart(pageNum) {
        if (pageNum <= 1) return 1;
        // For pages 2,3 -> spread starts at 2
        // For pages 4,5 -> spread starts at 4
        // For pages 6,7 -> spread starts at 6
        const spreadStart = Math.floor((pageNum - 2) / 2) * 2 + 2;
        return spreadStart;
    }

    getNextPageInBook() {
        // From cover -> first spread left page
        if (this.currentPage === 1) return Math.min(2, this.totalPages);
        
        // If last-even single page, no next
        if (this.totalPages % 2 === 0 && this.currentPage === this.totalPages) return null;
        
        // Compute current spread start
        const spreadStart = this.getSpreadStart(this.currentPage);
        const nextStart = spreadStart + 2;
        
        // If total pages is even and nextStart would be the last page, go to last page
        if (this.totalPages % 2 === 0 && nextStart >= this.totalPages) {
            return this.totalPages;
        }
        
        // Otherwise go to next spread start if within bounds
        if (nextStart <= this.totalPages) return nextStart;
        return null;
    }

    getPrevPageInBook() {
        // From first spread -> cover
        if (this.currentPage === 2 || this.currentPage === 3) return 1;
        
        // If on last-even page and total even -> go to previous spread start
        if (this.totalPages % 2 === 0 && this.currentPage === this.totalPages) {
            const prevStart = this.totalPages - 2;
            return Math.max(2, prevStart);
        }
        
        const spreadStart = this.getSpreadStart(this.currentPage);
        const prevStart = spreadStart - 2;
        if (prevStart <= 1) return 1;
        return prevStart;
    }

    addPageFlipAnimation(isForward) {
        // Skip animation for first page
        if (this.currentPage === 1) {
            return;
        }

        const leftContainer = document.getElementById('left-page-container');
        const rightContainer = document.getElementById('right-page-container');
        
        if (!leftContainer || !rightContainer) return;
        
        // Remove existing animation classes
        leftContainer.classList.remove('page-flipping', 'page-flip-left');
        rightContainer.classList.remove('page-flipping', 'page-flip-left');
        
        // Add appropriate animation based on direction
        if (isForward) {
            // Flipping forward - right page flips
            rightContainer.classList.add('page-flipping');
        } else {
            // Flipping backward - left page flips
            leftContainer.classList.add('page-flip-left');
        }
        
        // Remove animation class after animation completes
        setTimeout(() => {
            leftContainer.classList.remove('page-flipping', 'page-flip-left');
            rightContainer.classList.remove('page-flipping', 'page-flip-left');
        }, 800);
    }

    // Zoom methods
    zoomIn() {
        this.scale = Math.min(this.scale + 0.25, 3);
        this.updateZoomDisplay();
        this.updateZoomButtons();
        this.renderPage(this.currentPage, true);
    }

    zoomOut() {
        this.scale = Math.max(this.scale - 0.25, 0.5);
        this.updateZoomDisplay();
        this.updateZoomButtons();
        this.renderPage(this.currentPage, true);
    }
    
    updateZoomDisplay() {
        if (this.zoomLevel) {
            const zoomPercent = Math.round(this.scale * 100);
            this.zoomLevel.textContent = `${zoomPercent}%`;
        }
    }
    
    updateZoomButtons() {
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        
        if (zoomInBtn) {
            zoomInBtn.disabled = this.scale >= 3;
        }
        
        if (zoomOutBtn) {
            zoomOutBtn.disabled = this.scale <= 0.5;
        }
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
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => { this.audioEnabled = true; this.prevPage(); });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => { this.audioEnabled = true; this.nextPage(); });
        }
        
        // No page input anymore - removed for book-like experience
        
        // Zoom controls
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }
        
        // Audio controls
        const playPauseBtn = document.getElementById('play-pause');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }
        
        const muteBtn = document.getElementById('mute-unmute');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => this.toggleMute());
        }
        
        const replayBtn = document.getElementById('replay-page-sound');
        if (replayBtn) {
            replayBtn.addEventListener('click', async () => {
                this.audioEnabled = true;
                this.stopAudio();
                await this.playSoundFor(this.getPagesShownFor(this.currentPage));
            });
        }
        
        // Enable sound overlay
        const enableSoundBtn = document.getElementById('enable-sound');
        if (enableSoundBtn) {
            enableSoundBtn.addEventListener('click', () => {
                this.enableAudio();
            });
        }
        
        // Progress bar (removed)
        
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
        
        // Removed timeupdate and durationchange listeners
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Touch/swipe events for book container
        const bookContainer = document.querySelector('.book-container');
        if (bookContainer) {
            bookContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
            bookContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e));
            bookContainer.addEventListener('touchend', (e) => { this.audioEnabled = true; this.handleTouchEnd(e); });
        }
        
        // Resize events (CSS handles responsive design now)
        // window.addEventListener('resize', () => this.updateCanvasContainer());
        
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
                this.audioEnabled = true; this.prevPage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.audioEnabled = true; this.nextPage();
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
            case '_':
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
        // Progress display removed
    }

    updateAudioDuration() {
        // Duration display removed
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
        if (this.enableSoundOverlay) {
            this.enableSoundOverlay.style.display = 'flex';
        }
    }

    hideEnableSoundOverlay() {
        if (this.enableSoundOverlay) {
            this.enableSoundOverlay.style.display = 'none';
        }
    }

    hideLoading() {
        if (this.loadingSpinner) {
            this.loadingSpinner.style.display = 'none';
        }
    }

    updateLoadingProgress(message) {
        if (this.loadingSpinner) {
            const loadingText = this.loadingSpinner.querySelector('p');
            if (loadingText) {
                loadingText.textContent = message;
            }
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
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
        const errorMessage = document.getElementById('error-message');
        const retryButton = document.getElementById('retry-button');
        
        if (errorDisplay && errorMessage) {
            errorMessage.textContent = message;
            errorDisplay.style.display = 'block';
        }
        
        if (retryButton) {
            retryButton.onclick = () => {
                if (errorDisplay) {
                    errorDisplay.style.display = 'none';
                }
                location.reload();
            };
        }
        
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

    // Update progress bar
    updateProgress() {
        if (!this.progressFill || !this.progressText) return;
        
        const progress = (this.currentPage / this.totalPages) * 100;
        this.progressFill.style.width = `${progress}%`;
        this.progressText.textContent = `Trang ${this.currentPage} / ${this.totalPages}`;
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
