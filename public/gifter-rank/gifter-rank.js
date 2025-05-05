let previousData = null; // Store the last fetched data
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
  const accentColor = configData.gifterRank.accentColour || '#e3fc02'; // Default to yellow if not set
  const textColor = configData.gifterRank.textColour || '#FFFFFF'; // Default to white if not set
  
  // Create a style element to add dynamic CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .rank { color: ${accentColor}; }
    .profile-pic { border: 2px solid ${accentColor}; }
    .diamonds { color: ${accentColor}; }
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

async function fetchTopGifters() {
  try {
    const response = await fetch('/api/gifter-rank');
    const data = await response.json();
    
    // Filter excluded users if needed
    if (configData && configData.gifterRank.excludeUsers && Array.isArray(configData.gifterRank.excludeUsers)) {
      data.topGifters = data.topGifters.filter(gifter => 
        !configData.gifterRank.excludeUsers.includes(gifter.uniqueId.toLowerCase())
      );
    }
    
    // Compare new data with previous data
    if (JSON.stringify(data.topGifters) !== JSON.stringify(previousData)) {
      previousData = data.topGifters; // Update previousData
      updateDOM(data.topGifters); // Update DOM only if data has changed
    }
  } catch (error) {
    console.error('Error fetching top gifters:', error);
  }
}

function updateDOM(topGifters) {
  const container = document.getElementById('gifter-rank');
  container.innerHTML = ''; // Clear previous content

  topGifters.forEach((gifter, index) => {
    const row = document.createElement('div');
    row.className = 'gifter-row';
    row.style.position = 'relative'; // Use relative positioning

    // Trim nickname if longer than 15 characters
    const trimmedNickname = gifter.nickname.length > 15
      ? gifter.nickname.substring(0, 13) + '...'
      : gifter.nickname;

    row.innerHTML = `
      <div class="rank">${index + 1}</div>
      <img src="${gifter.profilePictureUrl}" alt="${gifter.nickname}" class="profile-pic" />
      <div class="details">
        <div class="nickname">${trimmedNickname}</div>
        <div class="diamonds">
          <img src="/images/coin.png" alt="Coin" class="coin-icon" />
          ${gifter.totalDiamonds}
        </div>
      </div>
    `;

    container.appendChild(row);

    // Animate the row if it's not in its final position
    if (previousData && previousData[index] !== gifter) {
      // Simple animation using CSS transitions
      row.style.top = `${-50}px`; // Start from above
      setTimeout(() => {
        row.style.top = '0px'; // Move to final position
      }, 0); // Trigger animation after adding to DOM
    }
  });
}

// Initialize config and apply styles on page load
fetchConfig().then(() => {
  // Fetch top gifters initially
  fetchTopGifters();
  
  // Set up interval to refresh data
  setInterval(fetchTopGifters, 1000);
});