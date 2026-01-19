TikTokStreamingToolkit
==================

A Node.js project to deliver Gift, Subscriber, and Follow notifications to OBS clients via browser source, built on top of [TikTokWidgets](https://github.com/isaackogan/).

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white&style=flat-square)](https://www.linkedin.com/in/alexlobaza/)
[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/alexlobaza)

This project is a Javascript tool based off of [TikTokWidgets](https://github.com/isaackogan/), which in turn is based on [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) by [@zerodytrash](https://github.com/zerodytrash/). It is meant to serve as a free, open source tool for streamers on the platform.

This is **not** an official product. It is a research project & tinkering tool for streamers. I've built all of this because I needed it for my stream. Since I am actively using and maintaing it, and I've gotten questions about it on stream, I thought I'd share it.

Feel free to make pull requests with missing/new features, fixes, etc.

## Features

- Real-time gift notifications with customizable sounds `http://localhost:8082/`
- Follow alerts with configurable animations `http://localhost:8082/`
- Subscriber notifications `http://localhost:8082/`
- Follower and gift goal widgets  `http://localhost:8082/follower-goal` and `http://localhost:8082/gift-goal`
- Gifter and like ranking system `http://localhost:8082/gifter-rank` and `http://localhost:8082/like-rank`
- Image slider widget with card flip animations `http://localhost:8082/image-slider`
- Customizable text scroller for announcements `http://localhost:8082/text-scroller`
- Exclude specific users from rankings
- Philips HUE integration for lighting effects
- Customizable colors, fonts, and animations
- Sound effects for different events
- Offsite log (.json) storage (viewership, comments, likes, subscribers, gifts and duration) to an endpoint you define
- Stream status API integration
- Page for tracking comments and stream events, with specific Team Member levels `http://localhost:8082/comments`

## Getting Started

### Prerequisites
1. Download a code editor like VSCode
2. Install [Node.js](https://nodejs.org/) on your system
3. Clone this repository or download and extract [this ZIP file](https://github.com/isaackogan/TikTokGiftWidget/archive/refs/heads/master.zip)
4. Open a console/terminal in the root directory of the project
5. Enter `npm i` to install all required dependencies

### Configuration
1. Copy `public/config.json.sample` to `public/config.json`
2. Edit `config.json` with your settings:
   - Set your TikTok username
   - Configure colors and animations
   - Set up your goals
   - Configure sound effects
   - Set up HUE integration (optional)
   - Configure API endpoints (optional)

### Running the Application
1. Enter `node server.js` to start the application server
2. You should see: `Server running! Please visit http://localhost:8081`

#### Continuing an Existing Stream
If you need to restart the server during a live stream without losing your data (likes, comments, gifts, followers, etc.), use the `--continue` flag:

```bash
node server.js --continue
```

or

```bash
node server.js -continue
```

This will:
- Preserve all existing data files (likes, comments, gifts, followers, etc.)
- Maintain timestamps and rankings
- Keep your stream statistics intact
- **Note**: This will NOT reset your data files, so use it when restarting during an active stream

### OBS Setup
1. In OBS, add a new Browser Source
2. Set the URL to `http://localhost:8082/`
3. Set the width and height according to your needs
4. Enable "Control audio via OBS" if you want to control sound volume through OBS
5. Click "OK" to save

### IMPORTANT: Notice About Sounds
Sounds will not work unless you click/interact with the page first after loading it due to a browser security feature preventing malicious popups & sounds. They will work fine in OBS, though.

## Philips HUE Integration

### Prerequisites
- Philips HUE Bridge
- At least one HUE light
- Network access to your HUE Bridge

### Setup Instructions
1. Find your HUE Bridge IP address:
   - Visit [discovery.meethue.com](https://discovery.meethue.com/)
   - Or use the HUE app to find the IP
2. Create a HUE developer account:
   - Visit [developers.meethue.com](https://developers.meethue.com/)
   - Create an account and register your application
3. Generate API credentials:
   - Follow the [HUE API documentation](https://developers.meethue.com/develop/get-started-2/)
   - Create a new user and get your username
4. Update your `config.json`:
   - Set `hue.enabled` to `true`
   - Add your HUE Bridge IP
   - Add your HUE username
   - Configure your target light group

### HUE Features
- Light effects for gifts
- Color changes for follows
- Special effects for subscribers
- Customizable light patterns
- Group control for multiple lights
- Initial state tracking for smooth light transitions

### HUE API Endpoints

#### Refetch Initial Lights State
During a stream, if you manually change your lights and want to update what the system considers the "initial" state (the baseline that lights revert to after effects), you can use this endpoint:

**Endpoint:** `POST /api/hue/refetch-initial-state`

**Usage:**
```bash
curl -X POST http://localhost:8082/api/hue/refetch-initial-state
```

**Response:**
```json
{
  "success": true,
  "message": "Initial lights state refetched successfully",
  "groupId": "1"
}
```

This endpoint:
- Fetches the current state of all lights in your configured group
- Updates the baseline state used when reverting lights after effects
- Allows you to update the "initial" state without restarting the server
- Useful if you manually adjust lights during a stream and want to preserve those settings as the new baseline

## Configuration Guide

### Basic Settings
```json
{
  "uniqueId": "YOUR_TIKTOK_USERNAME",
  "fontSize": 25,
  "fontWeight": 800,
  "fadeIn": 2000,
  "fadeOut": 2000,
  "fadeAfter": 5000,
  "textColour": "#ffffff",
  "nameColour": "#32C3A6"
}
```

### Sound Configuration
```json
{
  "sounds": {
    "gift": {
      "default": "/sounds/fc25_gift.wav"
    },
    "subscribe": "/sounds/enchanted.wav",
    "follow": ["/sounds/enchanted.wav"]
  }
}
```

### Goal Settings
```json
{
  "followerGoal": {
    "goal": 50,
    "startingCount": 0
  },
  "giftGoal": {
    "goal": 1000,
    "startingCount": 0
  }
}
```

### Image Slider Widget

The image slider widget displays a rotating sequence of PNG images with smooth card flip animations. It's perfect for showcasing sponsors, announcements, or promotional content during your stream.

#### Setup Instructions

1. **Create the images folder:**
   ```
   public/images/image-slider/
   ```

2. **Add your PNG images:**
   - Place your PNG files in the `public/images/image-slider/` folder
   - Recommended size: **450px × 780px** (maintains 1:1.73 aspect ratio)
   - Images will automatically scale to fit the widget container
   - Use PNG format for best quality and transparency support

3. **Configure the widget in `config.json`:**
   ```json
   {
     "imageSlider": {
       "disappearTime": 5,
       "images": [
         {
           "path": "/images/image-slider/sponsor1.png",
           "duration": 10
         },
         {
           "path": "/images/image-slider/announcement.png",
           "duration": 15
         },
         {
           "path": "/images/image-slider/promo.png",
           "duration": 8
         }
       ]
     }
   }
   ```

#### Configuration Options

- **`disappearTime`**: Number of seconds the widget disappears completely (default: 5)
- **`images`**: Array of image objects, each containing:
  - **`path`**: Path to the PNG file (relative to `public/` folder)
  - **`duration`**: How long to display this image in seconds

#### Widget Behavior

1. **Image Rotation**: Widget cycles through all configured images in sequence
2. **Card Flip Animation**: Each image transition uses a smooth 3D flip effect
3. **Disappear State**: After showing all images, the widget disappears for the configured time
4. **Infinite Loop**: After disappearing, the cycle starts over from the first image
5. **Error Handling**: If no images are configured, the widget hides with a console message

#### OBS Setup

1. Add a new Browser Source in OBS
2. Set the URL to `http://localhost:8082/image-slider`
3. Set the width and height according to your needs:
   - **Native size**: 450px × 780px
   - **Scale down**: Any smaller size (no quality loss)
   - **Scale up**: Can be made larger without distortion
4. Enable "Control audio via OBS" if needed
5. Click "OK" to save

#### Example Use Cases

- **Sponsor Showcase**: Display sponsor logos with different durations
- **Stream Announcements**: Show upcoming events or schedule
- **Promotional Content**: Highlight special offers or merchandise
- **Community Recognition**: Display supporter badges or achievements

#### Troubleshooting

- **Widget not showing**: Check console for error messages about missing configuration
- **Images not loading**: Verify file paths are correct and images exist in the specified folder
- **Animation issues**: Ensure browser supports CSS 3D transforms

## Troubleshooting

### Common Issues
1. **Sounds not playing**
   - Click the browser source in OBS
   - Check if the page is muted
   - Verify sound files exist in the correct location

2. **HUE lights not responding**
   - Verify HUE Bridge IP is correct
   - Check network connectivity
   - Verify API credentials
   - Ensure lights are in the correct group

3. **Widgets not showing**
   - Check if the server is running
   - Verify browser source URL
   - Check console for errors
   - Verify TikTok username is correct

## Credits and Acknowledgments

### Original Developers
This project was built upon the excellent work of:

* **Isaac Kogan** - *Original TikTokWidgets creator* - [isaackogan](https://github.com/isaackogan)
  - [LinkedIn](https://www.linkedin.com/in/isaac-kogan-5a45b9193/)
  - [GitHub](https://github.com/isaackogan)

* **Zerody** - *TikTok-Live-Connector creator* - [Zerody](https://github.com/zerodytrash/)
  - [GitHub](https://github.com/zerodytrash)

Their work on reverse-engineering TikTok's WebCast service and creating the initial widgets made this project possible.

## Contributors

* **Alex Lobaza** - *Current maintainer & primary developer* - [alexlobaza](https://github.com/alexlobaza)
  - [LinkedIn](https://www.linkedin.com/in/alexlobaza/)
  - [GitHub](https://github.com/alexlobaza)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

