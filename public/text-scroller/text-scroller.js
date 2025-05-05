const canvas = document.getElementById("lcdCanvas");
const ctx = canvas.getContext("2d");

// Pixel grid settings
const pixelSize = 2;
const cols = Math.floor(window.innerWidth / pixelSize);
const rows = Math.floor(100 / pixelSize); // Fixed height of 100px
canvas.width = cols * pixelSize;
canvas.height = rows * pixelSize;

// Default settings (will be overridden by config if available)
let offColor = "#222"; // Dark gray when pixel is off
let onColor = "#ffffff"; // White when pixel is on
let messagesURL = "";
let speed = 2; // Pixels per frame
let pauseTime = 60; // Frames to pause between messages (60 frames = 1 second at 60fps)
let refreshInterval = 180000; // Default 3 minutes (180000ms)
let accessKey = "";
let masterKey = "";

// Default messages in case the fetch fails
let messages = [
  "Loading messages from server...",
  "If you see this, we might be having connection issues"
];

let currentMessageIndex = 0;

// Scrolling text settings
const fontSize = Math.max(8, rows * 0.5 * pixelSize);

// Add padding to prevent cutoff
const paddingChars = "            "; // Extra spaces before and after text

// Pause settings
let pauseCounter = 0;
let isPaused = false;

// Current pixel matrix and its dimensions
let pixelMatrix = [];
let matrixWidth = 0;

// Text offset initialization
let textOffset = -cols;

async function loadConfigValues() {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const config = await response.json();
    
    // Extract textScroller configuration with validation
    if (config && config.textScroller) {
      const textScrollerConfig = config.textScroller;
      
      // Set speed if valid
      if (textScrollerConfig.speed !== undefined && !isNaN(Number(textScrollerConfig.speed))) {
        speed = Number(textScrollerConfig.speed);
      }
      
      // Set pause time between messages if valid
      if (textScrollerConfig.pauseBetweenMessages !== undefined && !isNaN(Number(textScrollerConfig.pauseBetweenMessages))) {
        // Convert seconds to frames (assuming 60fps)
        pauseTime = Number(textScrollerConfig.pauseBetweenMessages) * 60;
      }
      
      // Set messages URL if valid
      if (textScrollerConfig.messagesJsonURL && typeof textScrollerConfig.messagesJsonURL === 'string' && textScrollerConfig.messagesJsonURL.trim() !== '') {
        messagesURL = textScrollerConfig.messagesJsonURL.trim();
      }
      
      // Set refresh interval if valid
      if (textScrollerConfig.jsonRefreshIntervalMs !== undefined) {
        const refreshMs = Number(textScrollerConfig.jsonRefreshIntervalMs);
        if (!isNaN(refreshMs) && refreshMs > 0) {
          refreshInterval = refreshMs;
        }
      }
      
      // Set text color if valid
      if (textScrollerConfig.textColor && typeof textScrollerConfig.textColor === 'string') {
        // Simple validation for color format
        if (/^#([0-9A-F]{3}){1,2}$/i.test(textScrollerConfig.textColor) || 
            /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(textScrollerConfig.textColor)) {
          onColor = textScrollerConfig.textColor;
        }
      }
      
      // Set off color if valid
      if (textScrollerConfig.pixelOffColor && typeof textScrollerConfig.pixelOffColor === 'string') {
        // Simple validation for color format
        if (/^#([0-9A-F]{3}){1,2}$/i.test(textScrollerConfig.pixelOffColor) || 
            /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(textScrollerConfig.pixelOffColor)) {
          offColor = textScrollerConfig.pixelOffColor;
        }
      }
      
      // Set access key if provided
      if (textScrollerConfig.accessKey && typeof textScrollerConfig.accessKey === 'string' && 
          textScrollerConfig.accessKey.trim() !== '') {
        accessKey = textScrollerConfig.accessKey.trim();
      }
      
      // Set master key if provided
      if (textScrollerConfig.masterKey && typeof textScrollerConfig.masterKey === 'string' && 
          textScrollerConfig.masterKey.trim() !== '') {
        masterKey = textScrollerConfig.masterKey.trim();
      }
    }
    
    console.log("Config loaded successfully:", {
      speed,
      pauseTime,
      messagesURL,
      refreshInterval,
      onColor,
      offColor,
      // Don't log the full keys for security
      accessKey: accessKey ? "********" : null,
      masterKey: masterKey ? "********" : null
    });
  } catch (error) {
    console.error('Error loading config:', error);
    console.log('Using default values due to config loading error');
  }
}

// Function to fetch messages from JSON file
async function fetchMessages() {
  try {
    // Don't attempt to fetch if URL is empty
    if (!messagesURL) {
      console.warn("Messages URL is empty, using default messages");
      return;
    }
    
    // Add cache-busting query parameter to avoid browser caching
    const headers = {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Bin-Meta': false
    };
    
    // Only add keys if they are available
    if (accessKey) {
      headers['X-Access-Key'] = accessKey;
    }
    
    if (masterKey) {
      headers['X-Master-Key'] = masterKey;
    }
    
    const response = await fetch(`${messagesURL}?_=${Date.now()}`, { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if response contains messages array
    if (data && data.record && Array.isArray(data.record.messages)) {
      messages = data.record.messages;
      console.log("Successfully fetched messages:", messages);
    } else if (data && Array.isArray(data.messages)) {
      messages = data.messages;
      console.log("Successfully fetched messages:", messages);
    } else if (Array.isArray(data)) {
      messages = data;
      console.log("Successfully fetched messages array:", messages);
    } else {
      console.error("Invalid JSON format - expected messages array:", data);
    }
    
    // If we're currently displaying the last message of the old list,
    // reset to start from the beginning of the new list next
    if (currentMessageIndex >= messages.length) {
      currentMessageIndex = 0;
    }
  } catch (error) {
    console.error("Error fetching messages:", error);
  }
}

// Function to render text onto a pixel grid with improved font rendering
function generatePixelMatrix(text) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  
  // Estimate text width with a larger multiplier for pixel fonts
  const charWidthMultiplier = 1.5;
  const estimatedTextWidth = text.length * fontSize * charWidthMultiplier;
  
  tempCanvas.width = estimatedTextWidth;
  tempCanvas.height = rows * pixelSize * 1;
  
  // Enable font smoothing for initial rendering
  tempCtx.imageSmoothingEnabled = true;
  
  // Clear canvas
  tempCtx.fillStyle = "black";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
  // Set font and render text
  tempCtx.font = `${fontSize}px 'Press Start 2P', 'VT323', 'Courier New', monospace`;
  tempCtx.fillStyle = "white";
  tempCtx.textBaseline = "middle";
  
  // Center the text vertically
  const yPosition = tempCanvas.height * 0.5;
  tempCtx.fillText(text, 20, yPosition);
  
  // Extract pixel data with better sampling
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const pixelMatrix = [];
  
  // Adjust the step size based on the pixel size
  const sampleStep = Math.max(1, Math.floor(pixelSize / 2));
  
  for (let y = 0; y < tempCanvas.height; y += pixelSize) {
    const row = [];
    for (let x = 0; x < tempCanvas.width; x += pixelSize) {
      // Sample multiple points within the pixel area
      let onCount = 0;
      let totalSamples = 0;
      
      for (let sy = 0; sy < pixelSize; sy += sampleStep) {
        for (let sx = 0; sx < pixelSize; sx += sampleStep) {
          const sampleX = x + sx;
          const sampleY = y + sy;
          
          if (sampleX < tempCanvas.width && sampleY < tempCanvas.height) {
            const i = (sampleY * tempCanvas.width + sampleX) * 4; // 4 bytes per pixel (RGBA)
            if (i < imageData.data.length) {
              totalSamples++;
              if (imageData.data[i] > 100) {
                onCount++;
              }
            }
          }
        }
      }
      
      // Determine if this pixel should be on based on a threshold
      const threshold = pixelSize > 3 ? 0.25 : 0.5;
      row.push(totalSamples > 0 && (onCount / totalSamples) > threshold ? 1 : 0);
    }
    
    if (row.length > 0) {
      pixelMatrix.push(row);
    }
  }
  
  return pixelMatrix;
}

// Function to prepare the next message
function prepareNextMessage() {
  if (messages.length === 0) {
    messages = ["No messages available"];
  }
  
  const fullMessage = paddingChars + messages[currentMessageIndex] + paddingChars;
  pixelMatrix = generatePixelMatrix(fullMessage);
  matrixWidth = pixelMatrix[0] ? pixelMatrix[0].length : 0;
  textOffset = -cols; // Start off-screen
}

// Initialize: fetch messages then start display
async function initialize() {
  // First load configuration
  await loadConfigValues();
  
  // Initial fetch of messages
  await fetchMessages();
  
  // Set up periodic refresh of messages
  if (refreshInterval > 0) {
    setInterval(fetchMessages, refreshInterval);
  }
  
  // Initialize with the first message
  prepareNextMessage();
  
  // Start animation
  update();
}

function drawPixelGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let y = 0; y < Math.min(rows, pixelMatrix.length); y++) {
    for (let x = 0; x < cols; x++) {
      // Calculate the corresponding position in the pixel matrix
      const matrixX = x + Math.floor(textOffset);
      
      // Only draw if the position is within the matrix bounds
      if (matrixX >= 0 && matrixX < matrixWidth && pixelMatrix[y] && pixelMatrix[y][matrixX] !== undefined) {
        ctx.fillStyle = pixelMatrix[y][matrixX] ? onColor : offColor;
      } else {
        ctx.fillStyle = offColor; // Draw background if outside matrix bounds
      }
      
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize - 1, pixelSize - 1);
    }
  }
}

function update() {
  drawPixelGrid();
  
  if (!isPaused) {
    textOffset += speed; // Move right to left by incrementing the offset
    
    // Check if the text has completely scrolled out of view
    if (textOffset > matrixWidth) {
      isPaused = true;
      pauseCounter = 0;
    }
  } else {
    // Handle pause before displaying next message
    pauseCounter++;
    if (pauseCounter >= pauseTime) {
      isPaused = false;
      
      // Move to the next message
      currentMessageIndex = (currentMessageIndex + 1) % messages.length;
      prepareNextMessage();
    }
  }
  
  requestAnimationFrame(update);
}

// Start the application
initialize();