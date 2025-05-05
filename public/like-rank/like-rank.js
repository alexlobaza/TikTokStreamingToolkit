let previousData = null; // Store the last fetched data
let isWidgetVisible = true; // Flag to track widget visibility
let configData = null; // Store the configuration data

async function fetchConfig() {
  try {
    const response = await fetch('/config.json');
    configData = await response.json();
    applyStyles();
  } catch (error) {
    console.error('Error fetching config:', error);
  }
}

function applyStyles() {
  if (!configData) return;
  
  // Apply text and accent colors to CSS
  const accentColor = configData.likeRank.accentColour || '#e3fc02'; // Default to yellow if not set
  const textColor = configData.likeRank.textColour || '#FFFFFF'; // Default to white if not set
  
  // Create a style element to add dynamic CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .rank { color: ${accentColor}; }
    .profile-pic { border: 2px solid ${accentColor}; }
    .likes { color: ${accentColor}; }
  `;
  
  // Add or replace the style element
  const existingStyle = document.getElementById('dynamic-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  styleEl.id = 'dynamic-styles';
  document.head.appendChild(styleEl);
  
  // Set body text color
  document.body.style.color = textColor;
}

async function fetchTopLikers() {
  try {
    const response = await fetch('/api/like-rank');
    const data = await response.json();
    // Compare new data with previous data
    if (JSON.stringify(data.topLikers) !== JSON.stringify(previousData)) {
      previousData = data.topLikers; // Update previousData
      updateDOM(data.topLikers); // Update DOM only if data has changed
    }
  } catch (error) {
    console.error('Error fetching top likers:', error);
  }
}

function updateDOM(topLikers) {
  if (!isWidgetVisible) return; // Don't update if widget is hidden
  
  const container = document.getElementById('like-rank');
  container.innerHTML = ''; // Clear previous content
  
  topLikers.forEach((liker, index) => {
    const row = document.createElement('div');
    row.className = 'liker-row';
    row.style.position = 'relative'; // Use relative positioning
    
    // Trim nickname if longer than 15 characters
    const trimmedNickname = liker.nickname.length > 15
      ? liker.nickname.substring(0, 13) + '...'
      : liker.nickname;
      
    row.innerHTML = `
      <div class="rank">${index + 1}</div>
      <img src="${liker.profilePictureUrl}" alt="${liker.nickname}" class="profile-pic" />
      <div class="details">
        <div class="nickname">${trimmedNickname}</div>
        <div class="likes">
          <img src="/images/heart.png" alt="Like" class="like-icon" />
          ${liker.totalLikes}
        </div>
      </div>
    `;
    
    container.appendChild(row);
    
    // Animate the row if it's not in its final position
    if (previousData && previousData[index] !== liker) {
      // Simple animation using CSS transitions
      row.style.top = `${-50}px`; // Start from above
      setTimeout(() => {
        row.style.top = '0px'; // Move to final position
      }, 0); // Trigger animation after adding to DOM
    }
  });
}

function showHeart() {
  if (!configData) return;
  
  isWidgetVisible = false; // Hide widget
  const container = document.getElementById('like-rank');
  container.innerHTML = ''; // Clear previous content
  
  const heartDiv = document.createElement('div');
  heartDiv.style.textAlign = 'center';
  heartDiv.style.marginTop = '19%';
  
  const heartImg = document.createElement('img');
  heartImg.src = '/images/heart.png';
  heartImg.style.width = '100px';
  heartImg.style.height = '100px';
  heartImg.className = 'beating-heart';
  
  const textDiv = document.createElement('div');
  textDiv.style.fontSize = '22px';
  textDiv.style.color = configData.likeRank.accentColour || '#e3fc02'; // Use accent color
  textDiv.textContent = '';
  
  heartDiv.appendChild(heartImg);
  heartDiv.appendChild(textDiv);
  container.appendChild(heartDiv);
  
  // Revert back to widget after 10 seconds
  setTimeout(() => {
    isWidgetVisible = true; // Show widget again
    container.removeChild(heartDiv);
    updateDOM(previousData);
    fetchTopLikers(); // Refresh widget
  }, 10000); // Wait for 10 seconds
}

// Initialize config and apply styles on page load
fetchConfig().then(() => {
  // Fetch top likers initially
  fetchTopLikers();
  
  // Set up intervals
  setInterval(fetchTopLikers, 1000); // Refresh every second
  setInterval(showHeart, 180000); // Show heart every 3 minutes
});