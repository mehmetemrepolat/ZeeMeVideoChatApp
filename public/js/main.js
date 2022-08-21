'use strinct';

const socket = io.connect();

const localVideo = document.querySelector('#localVideo-container video');
const videoGrid = document.querySelector('#videoGrid');
const notification = document.querySelector('#notification');
const notify = (message) => {
    notification.innerHTML = message;
};

const pcConfig = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302',
            ],
        },
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com',
        },
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com',
        },
        {
            urls: 'turn:192.158.29.39:3478?transport=udp',
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808',
        },
    ],
};

/**
 * Initialize webrtc
 */
const webrtc = new Webrtc(socket, pcConfig, {
    log: true,
    warn: true,
    error: true,
});

/**
 * Create or join a room
 */
const roomInput = document.querySelector('#roomId');
const joinBtn = document.querySelector('#joinBtn');
joinBtn.addEventListener('click', () => {
    const oda = roomInput.value;
    if (!oda) {
        notify('Oda ID desteklenmemekte');
        return;
    }

    webrtc.odayaKatil(oda);
});

const setTitle = (status, e) => {
    const oda = e.detail.odaId;

    console.log(`Oda numarası:${oda}, ${status}`);

    notify(`Oda numarası: ${oda}, ${status}`);
    document.querySelector('h1').textContent = `ODA: ${oda}`;
    webrtc.yayinda();
};
webrtc.addEventListener('oda_olusturuldu', setTitle.bind(this, 'olusturuldu'));
webrtc.addEventListener('odayaKatildi', setTitle.bind(this, 'katildi.'));

/**
 * Leave the room
 */
const leaveBtn = document.querySelector('#leaveBtn');
leaveBtn.addEventListener('click', () => {
    webrtc.odadanAyril();
});
webrtc.addEventListener('Ayrıl', (e) => {
    const oda = e.detail.odaId;
    document.querySelector('h1').textContent = '';
    notify(`Odadan ayril ${oda}`);
});

/**
 * Get local media
 */
webrtc
    .getlocalYayin(true, { width: 640, height: 480 })
    .then((stream) => (localVideo.srcObject = stream));

webrtc.addEventListener('atıldın', () => {
    document.querySelector('h1').textContent = 'Odadan atıldınız';
    videoGrid.innerHTML = '';
});

webrtc.addEventListener('userLeave', (e) => {
    console.log(`Kullanıcı: ${e.detail.socketId} ayrıldı. `);
});

/**
 * Handle new user connection
 */
webrtc.addEventListener('newUser', (e) => {
    const socketId = e.detail.socketId;
    const stream = e.detail.stream;

    const videoContainer = document.createElement('div');
    videoContainer.setAttribute('class', 'grid-item');
    videoContainer.setAttribute('id', socketId);

    const video = document.createElement('video');
    video.setAttribute('autoplay', true);
    video.setAttribute('muted', true); // set to false
    video.setAttribute('playsinline', true);
    video.srcObject = stream;

    const p = document.createElement('p');
    p.textContent = socketId;

    videoContainer.append(p);
    videoContainer.append(video);


    if (webrtc.adminKontrol) {
        const kickBtn = document.createElement('button');
        kickBtn.setAttribute('class', 'kick_btn');
        kickBtn.textContent = 'X';

        kickBtn.addEventListener('click', () => {
            webrtc.kullanici_at(socketId);
        });

        videoContainer.append(kickBtn);
    }
    videoGrid.append(videoContainer);
});

webrtc.addEventListener('kullaniciAt', (e) => {
    const socketId = e.detail.socketId;
    if (!socketId) {
        // remove all remote stream elements
        videoGrid.innerHTML = '';
        return;
    }
    document.getElementById(socketId).remove();
});


webrtc.addEventListener('error', (e) => {
    const error = e.detail.error;
    console.error(error);

    notify(error);
});


webrtc.addEventListener('notification', (e) => {
    const notif = e.detail.notification;
    console.log(notif);

    notify(notif);
});
