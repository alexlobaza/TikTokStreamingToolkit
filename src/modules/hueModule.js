const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Read the config file
const configPath = path.join(__dirname, '../../public/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const hueConfig = config.hue;
const bridgeIP = hueConfig.hubIp;
const username = hueConfig.username;
const clientKey = hueConfig.clientkey;

let initialGroupState = {};

const axiosInstance = axios.create({
  baseURL: `http://${bridgeIP}/api/${username}`,
  headers: {
    'hue-application-key': clientKey
  }
});

async function fetchInitialGroupState(groupId) {
    try {
      const groupLights = await getGroupLights(groupId);
      for (const lightId of groupLights) {
        initialGroupState[lightId] = await getLightState(lightId);
      }
      console.log('Initial group state fetched');
    } catch (error) {
      console.error('Error fetching initial group state:', error.message);
    }
  }

async function setLightState(lightId, state) {
  try {
    const response = await axiosInstance.put(`/lights/${lightId}/state`, state);
    return response.data;
  } catch (error) {
    console.error('Error setting light state:', error.message);
    throw error;
  }
}

async function turnOnLight(lightId) {
  return setLightState(lightId, { on: true });
}

async function turnOffLight(lightId) {
  return setLightState(lightId, { on: false });
}

async function setBrightness(lightId, brightness) {
  return setLightState(lightId, { bri: brightness });
}

async function getLightState(lightId) {
  try {
    const response = await axiosInstance.get(`/lights/${lightId}`);
    return response.data.state;
  } catch (error) {
    console.error('Error getting light state:', error.message);
    throw error;
  }
}

async function getGroupLights(groupId) {
  try {
    const response = await axiosInstance.get(`/groups/${groupId}`);
    return response.data.lights;
  } catch (error) {
    console.error('Error getting group lights:', error.message);
    throw error;
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pulseGroupLights(groupId, { duration = 5000, count = 1, color = null, brightnessIncrease = 100, transitionTime = 10 }) {
    try {
      const groupLights = await getGroupLights(groupId);
  
      for (let i = 0; i < count; i++) {
        // Increase brightness and change color
        for (const lightId of groupLights) {
          const newBrightness = Math.min(254, initialGroupState[lightId].bri + brightnessIncrease);
          const state = {
            bri: newBrightness,
            transitiontime: transitionTime
          };
          if (color) {
            state.xy = color;
          }
          await setLightState(lightId, state);
        }
  
        // Wait for the specified duration
        await delay(duration);
  
        // Revert to initial state
        for (const lightId of groupLights) {
          const originalState = initialGroupState[lightId];
          await setLightState(lightId, {
            on: originalState.on,
            bri: originalState.bri,
            xy: originalState.xy,
            transitiontime: transitionTime
          });
        }
  
        // If it's not the last iteration, wait before the next pulse
        if (i < count - 1) {
          await delay(duration);
        }
      }
    } catch (error) {
      console.error('Error in pulseGroupLights:', error.message);
      throw error;
    }
}
    

module.exports = {
  turnOnLight,
  turnOffLight,
  setBrightness,
  getLightState,
  setLightState,
  pulseGroupLights,
  fetchInitialGroupState
};
