Imaging Photoplethysmography (iPPG) is a non-contact technology that enables remote heart rate monitoring using a simple camera, such as a webcam or a smartphone camera.
It is an evolution of traditional contact-based Photoplethysmography (PPG), which requires a dedicated sensor on the skin.
The core principle of iPPG is the detection of subtle, imperceptible changes in skin color that occur with each heartbeat

Generalized Methodology
The process of measuring heart rate using iPPG generally involves several key stages:

1)Video Acquisition
A camera records a video of an individual, typically focusing on the face as it is rich in blood vessels and often exposed.

2)Region of Interest (ROI) Detection
The system automatically identifies and tracks a specific area of skin within the video frames, such as the forehead or cheeks. This step often uses face-detection algorithms to ensure the ROI remains stable even with minor movements.

3)Raw Signal Extraction
From the selected ROI in each video frame, the system extracts a raw physiological signal. This is usually done by averaging the pixel values of one or more color channels (e.g., Red, Green, Blue). The green channel is often favored because hemoglobin has a high absorption rate for green light. The sequence of these average pixel values over time forms the raw BVP signal.

4)Signal Processing and Denoising
The raw signal is susceptible to noise from various sources, making this a critical step for accuracy.

  i)Motion Artifacts: Subject movements like head turning, smiling, or speaking can introduce significant interference. Advanced algorithms, such as optical flow, can be used to track and compensate for this motion.

  ii)Lighting Variations: Changes in ambient lighting can cause fluctuations in the signal that are not related to heart rate. Techniques like adaptive filtering and chrominance-based methods (which focus on color information separate from brightness) are used to remove this noise and isolate the true BVP signal.

5)Heart Rate Calculation
  After the BVP signal has been cleaned, its frequency is analyzed to determine the heart rate. A common method is the Fast Fourier Transform (FFT), which identifies the dominant frequency in the signal. This peak frequency directly corresponds to the pulse rate and is converted into beats per minute (BPM).

<img width="1819" height="982" alt="Screenshot 2025-08-21 095414" src="https://github.com/user-attachments/assets/ccbf6e94-b43e-41c1-981d-661b7e348910" />
<img width="1839" height="981" alt="image" src="https://github.com/user-attachments/assets/cdd95398-a6fa-4a74-8e75-e5edcf8368d5" />
