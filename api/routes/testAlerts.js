// api/routes/testAlerts.js - Show a fake alert in the overlay to preview it
//
// POST /api/test-alert/:event   (gift, follow, subscribe, superFan, share)
// Optional JSON body: { "giftName": "Rose" } to preview a gift's own sound.
//
// The overlay (public/app.js) handles it exactly like a real alert (current config.json,
// sound, light effect), but it is sent as a separate `testAlert` socket event, so the other
// widgets (comments, goals, rankings) and the stored stream data don't count it.
const express = require('express');
const router = express.Router();

const TEST_USER = 'Test Viewer';
const TEST_IMAGE = '/images/heart.png';

function testUser() {
    return {
        uniqueId: `test_viewer_${Date.now()}`, // unique, so "first follow only" doesn't hide it
        nickname: TEST_USER,
        profilePicture: { url: [TEST_IMAGE] },
    };
}

const builders = {
    gift: (options) => ({
        user: testUser(),
        giftDetails: {
            giftName: typeof options.giftName === 'string' && options.giftName.trim()
                ? options.giftName.trim().slice(0, 100)
                : 'Rose',
            giftImage: { url: ['/images/coin.png'] },
            giftType: 0,
        },
        repeatEnd: true,
        repeatCount: 1,
    }),
    follow: () => ({ user: testUser() }),
    subscribe: () => ({ user: testUser() }),
    superFan: () => {
        const user = testUser();
        return { nickname: user.nickname, uniqueId: user.uniqueId, user };
    },
    share: () => ({ user: testUser() }),
};

router.post('/test-alert/:event', express.json(), (req, res) => {
    const type = req.params.event;
    if (!Object.prototype.hasOwnProperty.call(builders, type)) {
        return res.status(404).json({ error: `Unknown event "${type}"`, events: Object.keys(builders) });
    }

    const options = req.body && typeof req.body === 'object' ? req.body : {};
    req.io.emit('testAlert', { type, data: builders[type](options) });

    // Every open widget page counts as a client; 0 means no overlay can show it
    res.json({ success: true, event: type, connectedClients: req.io.engine.clientsCount });
});

module.exports = router;
