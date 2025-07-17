let configData = null;
let currentImageIndex = 0;
let isVisible = true;
let images = [];
let disappearTime = 0;
let currentTimeout = null;

async function fetchConfig() {
  try {
    const response = await fetch('/config.json');
    configData = await response.json();
    initializeSlider();
  } catch (error) {
    console.error('Error fetching config:', error);
    hideWidget('Error fetching configuration');
  }
}

function initializeSlider() {
  if (!configData || !configData.imageSlider) {
    hideWidget('Image slider configuration not found in config.json');
    return;
  }

  const sliderConfig = configData.imageSlider;
  
  // Check if images array exists and has content
  if (!sliderConfig.images || !Array.isArray(sliderConfig.images) || sliderConfig.images.length === 0) {
    hideWidget('No images configured in imageSlider.images array');
    return;
  }

  // Validate images array
  const validImages = sliderConfig.images.filter(img => {
    if (!img.path || !img.duration) {
      console.warn('Invalid image configuration:', img);
      return false;
    }
    return true;
  });

  if (validImages.length === 0) {
    hideWidget('No valid images found in configuration');
    return;
  }

  images = validImages;
  disappearTime = (sliderConfig.disappearTime || 5) * 1000; // Convert to milliseconds, default 5 seconds

  console.log(`Image slider initialized with ${images.length} images`);
  showNextImage();
}

function hideWidget(reason) {
  console.log(`Image slider hidden: ${reason}`);
  const container = document.getElementById('image-slider');
  if (container) {
    container.style.display = 'none';
  }
  isVisible = false;
}

function showNextImage() {
  if (!isVisible || images.length === 0) return;

  const container = document.getElementById('image-slider');
  const currentImage = images[currentImageIndex];
  
  // Clear any existing timeout
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Create new image element
  const img = document.createElement('img');
  img.src = currentImage.path;
  img.alt = `Slider image ${currentImageIndex + 1}`;
  img.className = 'slider-image';
  
  // Clear container and add new image
  container.innerHTML = '';
  container.appendChild(img);
  
  // Ensure widget is visible and flipped in
  container.classList.remove('hide', 'flip-out');
  container.classList.add('flip-in');

  // Schedule next image or disappear state
  const duration = currentImage.duration * 1000; // Convert to milliseconds
  currentTimeout = setTimeout(() => {
    // Move to next image or disappear
    currentImageIndex = (currentImageIndex + 1) % (images.length + 1); // +1 for disappear state
    
    if (currentImageIndex === images.length) {
      // Disappear state - flip the entire widget out
      container.classList.remove('flip-in');
      container.classList.add('flip-out');
      
      setTimeout(() => {
        container.classList.add('hide');
        currentTimeout = setTimeout(() => {
          currentImageIndex = 0; // Reset to first image
          container.classList.remove('hide', 'flip-out');
          container.classList.add('flip-in');
          showNextImage();
        }, disappearTime);
      }, 300); // Wait for flip out animation
    } else {
      // Flip out current widget and show next
      container.classList.remove('flip-in');
      container.classList.add('flip-out');
      
      setTimeout(() => {
        showNextImage();
      }, 300); // Wait for flip animation
    }
  }, duration);
}

// Initialize on page load
fetchConfig(); 