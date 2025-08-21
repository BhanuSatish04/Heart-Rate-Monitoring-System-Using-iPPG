class iPPGHeartRateMonitor {
    constructor() {
        this.isMonitoring = false;
        this.video = document.getElementById('videoElement');
        this.overlayCanvas = document.getElementById('overlayCanvas');
        this.processingCanvas = document.getElementById('processingCanvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.processingCtx = this.processingCanvas.getContext('2d');
        
        // Signal processing parameters
        this.samplingRate = 30; // FPS
        this.windowSize = 300; // 10 seconds at 30 FPS
        this.filterLowPass = 3.5; // Hz
        this.filterHighPass = 0.4; // Hz
        this.sensitivity = 1.0;
        
        // Data buffers
        this.signalBuffer = [];
        this.timeBuffer = [];
        this.heartRateHistory = [];
        this.startTime = null;
        
        // ROI tracking
        this.faceRect = null;
        this.roiRect = null;
        this.faceDetected = false;
        this.stream = null;
        
        // Charts
        this.waveformChart = null;
        this.historyChart = null;
        
        // Algorithm settings
        this.algorithm = 'green_channel';
        
        // Processing state
        this.processingActive = false;
        this.frameCount = 0;
        
        this.initializeUI();
        this.setupCharts();
        this.checkBrowserCompatibility();
    }

    initializeUI() {
        // Button event listeners
        document.getElementById('startBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.startMonitoring();
        });
        
        document.getElementById('stopBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.stopMonitoring();
        });
        
        document.getElementById('calibrateBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.calibrate();
        });
        
        document.getElementById('exportBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.exportData();
        });
        
        // Settings event listeners
        document.getElementById('algorithmSelect').addEventListener('change', (e) => {
            this.algorithm = e.target.value;
            this.updateAlgorithmInfo();
        });
        
        document.getElementById('windowSize').addEventListener('change', (e) => {
            this.windowSize = parseInt(e.target.value) * this.samplingRate;
        });
        
        document.getElementById('sensitivity').addEventListener('input', (e) => {
            this.sensitivity = parseFloat(e.target.value);
        });
        
        document.getElementById('waveformScale').addEventListener('change', () => {
            this.updateWaveformChart();
        });
        
        this.updateAlgorithmInfo();
        
        // Video event listeners
        this.video.addEventListener('loadedmetadata', () => {
            this.setupCanvases();
        });
        
        this.video.addEventListener('canplay', () => {
            if (this.isMonitoring && !this.processingActive) {
                this.processingActive = true;
                this.processFrame();
            }
        });
    }

    async setupCamera() {
        try {
            // Stop any existing stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            // Request camera permissions
            this.updateStatus('cameraStatus', 'Camera: Requesting Access...', 'info');
            
            const constraints = {
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                },
                audio: false
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.onloadedmetadata = resolve;
            });
            
            await this.video.play();
            
            this.updateStatus('cameraStatus', 'Camera: Connected', 'success');
            return true;
            
        } catch (error) {
            console.error('Camera access failed:', error);
            let errorMessage = 'Camera: Access Failed';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Camera: Permission Denied';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'Camera: Not Found';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Camera: In Use';
            }
            
            this.updateStatus('cameraStatus', errorMessage, 'error');
            this.showCompatibilityNotice();
            return false;
        }
    }

    setupCanvases() {
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
            setTimeout(() => this.setupCanvases(), 100);
            return;
        }
        
        this.overlayCanvas.width = this.video.videoWidth;
        this.overlayCanvas.height = this.video.videoHeight;
        this.processingCanvas.width = this.video.videoWidth;
        this.processingCanvas.height = this.video.videoHeight;
        
        // Style the overlay canvas to match video dimensions
        const videoRect = this.video.getBoundingClientRect();
        this.overlayCanvas.style.width = '100%';
        this.overlayCanvas.style.height = '100%';
    }

    setupCharts() {
        // Waveform chart
        const waveformCtx = document.getElementById('waveformChart').getContext('2d');
        this.waveformChart = new Chart(waveformCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'PPG Signal',
                    data: [],
                    borderColor: '#1FB8CD',
                    backgroundColor: 'rgba(31, 184, 205, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(167, 169, 169, 0.2)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: false
            }
        });

        // History chart
        const historyCtx = document.getElementById('historyChart').getContext('2d');
        this.historyChart = new Chart(historyCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Heart Rate (BPM)',
                    data: [],
                    borderColor: '#FFC185',
                    backgroundColor: 'rgba(255, 193, 133, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#FFC185',
                    pointBorderColor: '#FFC185',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time (seconds)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'BPM'
                        },
                        min: 40,
                        max: 120,
                        grid: {
                            color: 'rgba(167, 169, 169, 0.2)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    async startMonitoring() {
        if (this.isMonitoring) return;
        
        // Disable start button and show loading state
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        startBtn.disabled = true;
        startBtn.textContent = 'Initializing...';
        
        const cameraReady = await this.setupCamera();
        if (!cameraReady) {
            startBtn.disabled = false;
            startBtn.textContent = 'Start Monitoring';
            return;
        }
        
        this.isMonitoring = true;
        this.processingActive = true;
        this.startTime = Date.now();
        this.signalBuffer = [];
        this.timeBuffer = [];
        this.heartRateHistory = [];
        this.frameCount = 0;
        
        startBtn.textContent = 'Start Monitoring';
        stopBtn.disabled = false;
        
        this.updateStatus('hrStatus', 'Initializing...', 'info');
        this.updateHeartRate('--');
        
        // Start processing loop
        setTimeout(() => {
            if (this.isMonitoring) {
                this.processFrame();
            }
        }, 1000);
    }

    stopMonitoring() {
        this.isMonitoring = false;
        this.processingActive = false;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.video.srcObject = null;
        
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        this.updateStatus('cameraStatus', 'Camera: Disconnected', 'info');
        this.updateStatus('faceStatus', 'Face: Not Detected', 'info');
        this.updateStatus('hrStatus', 'Stopped', 'info');
        
        this.faceDetected = false;
        this.clearOverlay();
    }

    processFrame() {
        if (!this.isMonitoring || !this.processingActive) return;
        
        try {
            this.frameCount++;
            
            // Process every other frame to reduce load
            if (this.frameCount % 2 === 0) {
                // Detect face and extract ROI
                this.detectFace();
                
                if (this.faceDetected && this.roiRect) {
                    // Extract signal from ROI
                    const signalValue = this.extractSignal(this.roiRect);
                    
                    if (signalValue !== null && !isNaN(signalValue)) {
                        const currentTime = (Date.now() - this.startTime) / 1000;
                        this.signalBuffer.push(signalValue);
                        this.timeBuffer.push(currentTime);
                        
                        // Maintain buffer size
                        if (this.signalBuffer.length > this.windowSize) {
                            this.signalBuffer.shift();
                            this.timeBuffer.shift();
                        }
                        
                        // Process signal if we have enough data
                        if (this.signalBuffer.length >= this.samplingRate * 5) { // 5 seconds minimum
                            this.processSignalData();
                        }
                        
                        // Update waveform every 10 frames to reduce load
                        if (this.frameCount % 10 === 0) {
                            this.updateWaveformChart();
                        }
                    }
                }
                
                // Update signal quality every 30 frames
                if (this.frameCount % 30 === 0) {
                    this.updateSignalQuality();
                }
            }
            
        } catch (error) {
            console.error('Frame processing error:', error);
        }
        
        // Continue processing
        if (this.isMonitoring) {
            requestAnimationFrame(() => this.processFrame());
        }
    }

    detectFace() {
        if (!this.video.videoWidth || !this.video.videoHeight) return;
        
        try {
            this.processingCtx.drawImage(this.video, 0, 0);
            const imageData = this.processingCtx.getImageData(0, 0, this.processingCanvas.width, this.processingCanvas.height);
            
            // Simple face detection using skin color and face proportions
            const faceRegion = this.findFaceRegion(imageData);
            
            if (faceRegion) {
                this.faceRect = faceRegion;
                this.roiRect = this.calculateROI(faceRegion);
                this.faceDetected = true;
                this.updateStatus('faceStatus', 'Face: Detected', 'success');
                this.drawFaceOverlay();
            } else {
                this.faceDetected = false;
                this.updateStatus('faceStatus', 'Face: Not Detected', 'warning');
                this.clearOverlay();
            }
        } catch (error) {
            console.error('Face detection error:', error);
            this.faceDetected = false;
            this.updateStatus('faceStatus', 'Face: Detection Error', 'error');
        }
    }

    findFaceRegion(imageData) {
        const { width, height, data } = imageData;
        
        // Simple face detection based on skin color detection
        const skinPixels = [];
        const sampleStep = 4; // Sample every 4th pixel for performance
        
        for (let y = 0; y < height; y += sampleStep) {
            for (let x = 0; x < width; x += sampleStep) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                // Basic skin color detection
                if (this.isSkinColor(r, g, b)) {
                    skinPixels.push({ x, y });
                }
            }
        }
        
        if (skinPixels.length < 50) return null;
        
        // Find bounding box of skin pixels
        const minX = Math.min(...skinPixels.map(p => p.x));
        const maxX = Math.max(...skinPixels.map(p => p.x));
        const minY = Math.min(...skinPixels.map(p => p.y));
        const maxY = Math.max(...skinPixels.map(p => p.y));
        
        const faceWidth = maxX - minX;
        const faceHeight = maxY - minY;
        
        // Basic face proportion check
        const ratio = faceHeight / faceWidth;
        if (ratio > 0.6 && ratio < 2.0 && faceWidth > 40 && faceHeight > 50) {
            return { x: minX, y: minY, width: faceWidth, height: faceHeight };
        }
        
        return null;
    }

    isSkinColor(r, g, b) {
        // Enhanced skin color detection
        if (r < 50 || g < 40 || b < 20) return false;
        if (r > 250 || g > 250 || b > 250) return false;
        
        // Check if red is dominant
        if (r <= g || r <= b) return false;
        
        // Check color differences
        const rg = r - g;
        const rb = r - b;
        const gb = Math.abs(g - b);
        
        return (rg >= 10) && (rb >= 10) && (gb <= 20);
    }

    calculateROI(faceRect) {
        // Extract forehead region (top 30% of face, middle 60% width)
        const roiX = Math.max(0, faceRect.x + faceRect.width * 0.2);
        const roiY = Math.max(0, faceRect.y + faceRect.height * 0.1);
        const roiWidth = Math.min(faceRect.width * 0.6, this.processingCanvas.width - roiX);
        const roiHeight = Math.min(faceRect.height * 0.3, this.processingCanvas.height - roiY);
        
        return { x: roiX, y: roiY, width: roiWidth, height: roiHeight };
    }

    extractSignal(roi) {
        try {
            this.processingCtx.drawImage(this.video, 0, 0);
            const imageData = this.processingCtx.getImageData(
                Math.floor(roi.x), 
                Math.floor(roi.y), 
                Math.floor(roi.width), 
                Math.floor(roi.height)
            );
            
            let totalR = 0, totalG = 0, totalB = 0;
            let pixelCount = 0;
            
            // Sample pixels with step for performance
            const step = 4;
            for (let i = 0; i < imageData.data.length; i += 4 * step) {
                totalR += imageData.data[i];
                totalG += imageData.data[i + 1];
                totalB += imageData.data[i + 2];
                pixelCount++;
            }
            
            if (pixelCount === 0) return null;
            
            const avgR = totalR / pixelCount;
            const avgG = totalG / pixelCount;
            const avgB = totalB / pixelCount;
            
            // Apply selected algorithm
            switch (this.algorithm) {
                case 'green_channel':
                    return avgG;
                case 'chrom':
                    return this.chromAlgorithm(avgR, avgG, avgB);
                case 'pos':
                    return this.posAlgorithm(avgR, avgG, avgB);
                default:
                    return avgG;
            }
        } catch (error) {
            console.error('Signal extraction error:', error);
            return null;
        }
    }

    chromAlgorithm(r, g, b) {
        const mean = (r + g + b) / 3;
        if (mean === 0) return 0;
        
        const chrR = r / mean - 1;
        const chrG = g / mean - 1;
        
        return 3 * chrR - 2 * chrG;
    }

    posAlgorithm(r, g, b) {
        const l1 = 0.77;
        const l2 = -0.51;
        const l3 = 0.38;
        
        return l1 * r + l2 * g + l3 * b;
    }

    processSignalData() {
        if (this.signalBuffer.length < this.samplingRate * 5) return;
        
        try {
            // Apply filtering
            const filteredSignal = this.applyBandpassFilter([...this.signalBuffer]);
            
            // Calculate heart rate using FFT
            const heartRate = this.calculateHeartRate(filteredSignal);
            
            if (heartRate && heartRate >= 45 && heartRate <= 180) {
                this.updateHeartRate(Math.round(heartRate));
                
                // Add to history
                const currentTime = (Date.now() - this.startTime) / 1000;
                this.heartRateHistory.push({ time: currentTime, value: heartRate });
                
                // Limit history to last 60 seconds
                this.heartRateHistory = this.heartRateHistory.filter(
                    entry => currentTime - entry.time <= 60
                );
                
                this.updateHistoryChart();
                this.updateStatus('hrStatus', 'Measuring...', 'success');
            } else {
                this.updateStatus('hrStatus', 'Poor Signal Quality', 'warning');
            }
        } catch (error) {
            console.error('Signal processing error:', error);
        }
    }

    applyBandpassFilter(signal) {
        if (signal.length < 10) return signal;
        
        // Remove DC component
        const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
        let filtered = signal.map(x => x - mean);
        
        // Simple moving average for noise reduction
        const windowSize = 3;
        const smoothed = [];
        
        for (let i = 0; i < filtered.length; i++) {
            let sum = 0;
            let count = 0;
            
            for (let j = Math.max(0, i - windowSize); j <= Math.min(filtered.length - 1, i + windowSize); j++) {
                sum += filtered[j];
                count++;
            }
            
            smoothed.push(sum / count);
        }
        
        return smoothed;
    }

    calculateHeartRate(signal) {
        const N = signal.length;
        if (N < 64) return null;
        
        try {
            // Find peaks in the signal
            const peaks = this.findPeaks(signal);
            
            if (peaks.length < 3) return null;
            
            // Calculate intervals between peaks
            const intervals = [];
            for (let i = 1; i < peaks.length; i++) {
                intervals.push(peaks[i] - peaks[i-1]);
            }
            
            // Calculate average interval
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            
            // Convert to heart rate (samples to BPM)
            const heartRate = (this.samplingRate * 60) / avgInterval;
            
            return heartRate;
        } catch (error) {
            console.error('Heart rate calculation error:', error);
            return null;
        }
    }

    findPeaks(signal) {
        const peaks = [];
        const threshold = 0.3;
        const minDistance = 10; // Minimum distance between peaks
        
        for (let i = 1; i < signal.length - 1; i++) {
            if (signal[i] > signal[i-1] && signal[i] > signal[i+1] && signal[i] > threshold) {
                // Check minimum distance from last peak
                if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
                    peaks.push(i);
                }
            }
        }
        
        return peaks;
    }

    updateHeartRate(value) {
        const hrElement = document.getElementById('heartRateValue');
        hrElement.textContent = value;
        
        if (value !== '--') {
            hrElement.classList.add('pulse');
            setTimeout(() => hrElement.classList.remove('pulse'), 600);
            
            // Update confidence based on signal quality
            const confidence = this.calculateConfidence();
            document.getElementById('confidenceFill').style.width = confidence + '%';
        }
    }

    calculateConfidence() {
        if (this.signalBuffer.length < 30) return 0;
        
        try {
            const recent = this.signalBuffer.slice(-30);
            const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
            const variance = recent.reduce((sum, x) => sum + (x - mean) ** 2, 0) / recent.length;
            
            if (variance === 0) return 50;
            
            const cv = Math.sqrt(variance) / Math.abs(mean); // Coefficient of variation
            const confidence = Math.max(0, Math.min(100, (1 - cv) * 100));
            
            return confidence;
        } catch (error) {
            return 0;
        }
    }

    updateSignalQuality() {
        const confidence = this.calculateConfidence();
        const snr = Math.max(0, confidence / 10);
        document.getElementById('snrValue').textContent = snr.toFixed(1) + ' dB';
        
        // Update motion detection
        const motion = this.faceDetected ? 'Low' : 'High';
        document.getElementById('motionValue').textContent = motion;
        
        // Update lighting assessment
        const lighting = this.assessLighting();
        document.getElementById('lightingValue').textContent = lighting;
        
        // Update processing load
        document.getElementById('processingLoad').textContent = this.isMonitoring ? 'Active' : 'Ready';
    }

    assessLighting() {
        if (!this.roiRect || !this.faceDetected) return 'Unknown';
        
        try {
            this.processingCtx.drawImage(this.video, 0, 0);
            const imageData = this.processingCtx.getImageData(
                Math.floor(this.roiRect.x), 
                Math.floor(this.roiRect.y), 
                Math.floor(this.roiRect.width), 
                Math.floor(this.roiRect.height)
            );
            
            let totalBrightness = 0;
            let pixelCount = 0;
            
            for (let i = 0; i < imageData.data.length; i += 16) { // Sample fewer pixels
                const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
                totalBrightness += brightness;
                pixelCount++;
            }
            
            const avgBrightness = totalBrightness / pixelCount;
            
            if (avgBrightness < 50) return 'Too Dark';
            if (avgBrightness > 200) return 'Too Bright';
            return 'Good';
        } catch (error) {
            return 'Unknown';
        }
    }

    updateWaveformChart() {
        if (!this.waveformChart || this.signalBuffer.length === 0) return;
        
        try {
            const scale = parseFloat(document.getElementById('waveformScale').value);
            const displayPoints = Math.min(this.signalBuffer.length, 150);
            const startIdx = Math.max(0, this.signalBuffer.length - displayPoints);
            
            const labels = [];
            const data = [];
            
            for (let i = startIdx; i < this.signalBuffer.length; i++) {
                labels.push(i);
                data.push(this.signalBuffer[i] * scale);
            }
            
            this.waveformChart.data.labels = labels;
            this.waveformChart.data.datasets[0].data = data;
            this.waveformChart.update('none');
        } catch (error) {
            console.error('Waveform chart update error:', error);
        }
    }

    updateHistoryChart() {
        if (!this.historyChart || this.heartRateHistory.length === 0) return;
        
        try {
            const labels = this.heartRateHistory.map(entry => entry.time.toFixed(1));
            const data = this.heartRateHistory.map(entry => entry.value);
            
            this.historyChart.data.labels = labels;
            this.historyChart.data.datasets[0].data = data;
            this.historyChart.update('none');
        } catch (error) {
            console.error('History chart update error:', error);
        }
    }

    drawFaceOverlay() {
        try {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            
            if (this.faceRect) {
                // Draw face rectangle
                this.overlayCtx.strokeStyle = '#1FB8CD';
                this.overlayCtx.lineWidth = 2;
                this.overlayCtx.strokeRect(this.faceRect.x, this.faceRect.y, this.faceRect.width, this.faceRect.height);
                
                // Draw ROI rectangle
                if (this.roiRect) {
                    this.overlayCtx.strokeStyle = '#FFC185';
                    this.overlayCtx.lineWidth = 2;
                    this.overlayCtx.strokeRect(this.roiRect.x, this.roiRect.y, this.roiRect.width, this.roiRect.height);
                    
                    // Add labels
                    this.overlayCtx.fillStyle = '#1FB8CD';
                    this.overlayCtx.font = '14px Arial';
                    this.overlayCtx.fillText('Face', this.faceRect.x, this.faceRect.y - 5);
                    
                    this.overlayCtx.fillStyle = '#FFC185';
                    this.overlayCtx.fillText('ROI', this.roiRect.x, this.roiRect.y - 5);
                }
            }
        } catch (error) {
            console.error('Overlay drawing error:', error);
        }
    }

    clearOverlay() {
        try {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        } catch (error) {
            console.error('Overlay clearing error:', error);
        }
    }

    calibrate() {
        if (!this.isMonitoring) return;
        
        // Reset buffers for recalibration
        this.signalBuffer = [];
        this.timeBuffer = [];
        this.startTime = Date.now();
        this.frameCount = 0;
        
        this.updateStatus('hrStatus', 'Calibrating...', 'info');
        this.updateHeartRate('--');
        
        setTimeout(() => {
            if (this.isMonitoring) {
                this.updateStatus('hrStatus', 'Measuring...', 'info');
            }
        }, 3000);
    }

    exportData() {
        if (this.heartRateHistory.length === 0) {
            alert('No data to export. Start monitoring first to collect heart rate data.');
            return;
        }
        
        try {
            const csvContent = 'Time (seconds),Heart Rate (BPM)\n' +
                this.heartRateHistory.map(entry => `${entry.time.toFixed(2)},${entry.value.toFixed(1)}`).join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `heart_rate_data_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data. Please try again.');
        }
    }

    updateStatus(elementId, text, type) {
        try {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = text;
                element.className = `status status--${type}`;
            }
        } catch (error) {
            console.error('Status update error:', error);
        }
    }

    updateAlgorithmInfo() {
        const algorithmInfo = {
            'green_channel': 'Extracts heart rate from green color channel variations',
            'chrom': 'Chrominance-based method using color ratios',
            'pos': 'Plane-orthogonal-to-skin method for motion robustness'
        };
        
        console.log('Algorithm:', this.algorithm, '-', algorithmInfo[this.algorithm]);
    }

    checkBrowserCompatibility() {
        const hasWebRTC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        const hasCanvas = !!document.createElement('canvas').getContext;
        const hasRequestAnimationFrame = !!window.requestAnimationFrame;
        
        if (!hasWebRTC || !hasCanvas || !hasRequestAnimationFrame) {
            this.showCompatibilityNotice();
        }
    }

    showCompatibilityNotice() {
        const notice = document.getElementById('compatibilityNotice');
        if (notice) {
            notice.classList.remove('hidden');
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    try {
        const monitor = new iPPGHeartRateMonitor();
        window.iPPGMonitor = monitor;
        console.log('iPPG Heart Rate Monitor initialized successfully');
    } catch (error) {
        console.error('Failed to initialize iPPG Monitor:', error);
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.iPPGMonitor?.isMonitoring) {
        console.log('Page hidden, monitoring continues in background');
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.iPPGMonitor?.overlayCanvas) {
        setTimeout(() => {
            if (window.iPPGMonitor.setupCanvases) {
                window.iPPGMonitor.setupCanvases();
            }
        }, 100);
    }
});