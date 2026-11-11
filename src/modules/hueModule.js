const axios = require('axios');
const { getConfigStore } = require('./configStore');

// Bridge connection details are read once at startup (changing them needs a restart)
const config = getConfigStore().current;

const hueConfig = config.hue;
const bridgeIP = hueConfig.hubIp;
const username = hueConfig.username;
const clientKey = hueConfig.clientkey;

let initialGroupState = {};
// Group the baseline was last captured for (the alert group can change while running)
let initialStateGroupId = null;

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
      initialStateGroupId = String(groupId);
      console.log('Initial group state fetched');
    } catch (error) {
      console.error('Error fetching initial group state:', error.message);
    }
  }

// With a groupId: whether the baseline was captured for that group
function hasInitialGroupState(groupId) {
  if (groupId !== undefined && groupId !== null) {
    return initialStateGroupId === String(groupId);
  }
  return Object.keys(initialGroupState).length > 0;
}

// Baseline state captured by fetchInitialGroupState (what effects revert to)
function getInitialLightState(lightId) {
  return initialGroupState[lightId];
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

// Everything the bridge knows, for the group picker and lightboard (rooms, zones, entertainment areas)
async function getAllGroups() {
  const response = await axiosInstance.get('/groups');
  return response.data;
}

async function getAllLights() {
  const response = await axiosInstance.get('/lights');
  return response.data;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// colors: optional list of xy colors, cycled one per pulse (takes precedence over `color`)
// gap: ms between pulses; defaults to `duration`, which was the only behavior before
// turnOnIfOff: switch on lights whose normal state is off for each pulse (the revert switches
//   them off again). Without it, pulses on an off light are ignored by the bridge.
// shouldContinue: optional () => boolean, checked between pulses so a looping preview can stop early
async function pulseGroupLights(groupId, { duration = 5000, count = 1, color = null, colors = null, gap = duration, brightnessIncrease = 100, transitionTime = 10, turnOnIfOff = false, shouldContinue = null }) {
    try {
      const groupLights = await getGroupLights(groupId);
      const palette = Array.isArray(colors) && colors.length > 0 ? colors : (color ? [color] : []);
  
      for (let i = 0; i < count; i++) {
        // Increase brightness and change color
        for (const lightId of groupLights) {
          const newBrightness = Math.min(254, initialGroupState[lightId].bri + brightnessIncrease);
          const state = {
            bri: newBrightness,
            transitiontime: transitionTime
          };
          const pulseColor = palette.length > 0 ? palette[i % palette.length] : null;
          if (pulseColor) {
            state.xy = pulseColor;
          }
          if (turnOnIfOff && initialGroupState[lightId].on === false) {
            state.on = true;
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
          if (shouldContinue && !shouldContinue()) break;
          await delay(gap);
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
  fetchInitialGroupState,
  hasInitialGroupState,
  getInitialLightState,
  getGroupLights,
  getAllGroups,
  getAllLights
};
