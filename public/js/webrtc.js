'use strict';

class Webrtc extends EventTarget {
    constructor(
        socket,
        pcConfig = null,
        logging = { log: true, warn: true, error: true }
    ) {
        super();
        this.oda;
        this.socket = socket;
        this.pcConfig = pcConfig;

        this._IDno = null;
        this.pcs = {}; // Katılımcı Listesi
        this.streams = {};
        this.mevcutOda;
        this.inCall = false;
        this.hazirMi = false; // Hazır mı?
        this.isInitiator = false; //
        this._adminKontrol = false; // Admin Kontrolü için
        this._localYayin = null;

        // Manage logging
        this.log = logging.log ? console.log : () => {};
        this.warn = logging.warn ? console.warn : () => {};
        this.error = logging.error ? console.error : () => {};

        // Initialize socket.io listeners
        this._soketBaglantilari();
    }

    // Custom event emitter
    _emit(eventName, details) {
        this.dispatchEvent(
            new CustomEvent(eventName, {
                detail: details,
            })
        );
    }

    get localYayin() {
        return this._localYayin;
    }

    get IDno() {
        return this._IDno;
    }

    get adminKontrol() {
        return this._adminKontrol;
    }

    get odaId() {
        return this.oda;
    }

    get katilimcilar() {
        return Object.keys(this.pcs);
    }

    yayinda() {
        if (this.oda) {//odanın içerisinde olup olunmadığı
            this._sendMessage({ type: 'yayinda' }, null, this.oda);
        } else {
            this.warn('Yayına başlamadan önce bir odaya katılmanız gerekmekte');

            this._emit('notification', {
                notification: `Yayına başlamadan önce bir odaya katılmanız gerekmekte`,
            });
        }
    }

    odayaKatil(oda) {
        if (this.oda) {
            this.warn('Yeni bir odaya katılmadan önce, mevcut odadan ayrılmanız gerekmekte!');

            this._emit('notification', {
                notification: `Yeni bir odaya katılmadan önce, mevcut odadan ayrılmanız gerekmekte!`,
            });
            return;
        }
        if (!oda) {
            this.warn('Oda ID desteklenmemekte');

            this._emit('notification', {
                notification: `Oda ID desteklenmemekte`,
            });
            return;
        }
        this.socket.emit('oluştur veya katıl', oda);
    }

    odadanAyril() {
        if (!this.oda) {
            this.warn('Herhangi bir odada değilsiniz..');

            this._emit('notification', {
                notification: `Herhangi bir odada değilsiniz..`,
            });
            return;
        }
        this.isInitiator = false;
        this.socket.emit('odadan ayrıl', this.oda);
    }

    // Get local stream
    getlocalYayin(audioConstraints, videoConstraints) {
        return navigator.mediaDevices
            .getUserMedia({
                audio: audioConstraints,
                video: videoConstraints,
            })
            .then((stream) => {
                this.log('Local yayında.');
                this._localYayin = stream;
                return stream;
            })
            .catch(() => {
                this.error("Kullanıcı verileri alınamadı!");

                this._emit('error', {
                    error: new Error(`Kullanıcı verileri alınamadı!`),
                });
            });
    }

    /**
     * Try connecting to peers
     * if got local stream and is ready for connection
     */
    _baglan(soketID) {
        if (typeof this._localYayin !== 'undefined' && this.hazirMi) {
            this.log('Bağlantı oluşturuluyor: ', soketID);

            this._createPeerConnection(soketID);
            this.pcs[soketID].addStream(this._localYayin);

            if (this.isInitiator) {
                this.log(soketID, ' bildirim oluşturuluyor.');

                this._makeOffer(soketID);
            }
        } else {
            this.warn('Bağlanılamıyor..');
        }
    }

    /**
     * Initialize listeners for socket.io events
     */
    _soketBaglantilari() {
        this.log('Soket Bağlantıları Gerçekleşti');

        // Oda oluşturma
        this.socket.on('olusturuldu', (oda, soketID) => {
            this.oda = oda;
            this._IDno = soketID;
            this.isInitiator = true;
            this._adminKontrol = true;

            this._emit('oda_olusturuldu', { odaId: oda });
        });

        // Odaya Katılma
        this.socket.on('katildi', (oda, soketID) => {
            this.log('katildi: ' + oda);

            this.oda = oda;
            this.hazirMi = true;
            this._IDno = soketID;

            this._emit('odayaKatildi', { odaId: oda });
        });

        // odadan ayrılma
        this.socket.on('odadan ayrıl', (oda) => {
            if (oda === this.oda) {
                this.warn(`${oda} numaralı odadan ayrıl`);

                this.oda = null;
                this._kullaniciAt();
                this._emit('ayril', {
                    odaId: oda,
                });
            }
        });

        // Odaya katılma
        this.socket.on('katil', (oda) => {
            this.log('Odaya katılma isteği: ' + oda);

            this.hazirMi = true;

            this.dispatchEvent(new Event('yeniKatilim'));
        });

        // Room is ready for connection
        this.socket.on('hazir', (user) => {
            this.log('Kullanıcı: ', user, ' odaya katıldı');

            if (user !== this._IDno && this.inCall) this.isInitiator = true;
        });

        // Someone got kicked from call
        this.socket.on('ban', (soketID) => {
            this.log('Kullanıcı atıldı: ', soketID);

            if (soketID === this._IDno) {
                // You got kicked out
                this.dispatchEvent(new Event('atıldın'));
                this._kullaniciAt();
            } else {
                // Someone else got kicked out
                this._kullaniciAt(soketID);
            }
        });

        // Logs from server
        this.socket.on('log', (log) => {
            this.log.apply(console, log);
        });

        /**
         * Message from the server
         * Manage stream and sdp exchange between peers
         */
        this.socket.on('message', (message, soketID) => {
            this.log('From', soketID, ' received:', message.type);

            // Participant leaves
            if (message.type === 'leave') {
                this.log(soketID, 'Left the call.');
                this._kullaniciAt(soketID);
                this.isInitiator = true;

                this._emit('userLeave', { soketID: soketID });
                return;
            }

            // Avoid dublicate connections
            if (
                this.pcs[soketID] &&
                this.pcs[soketID].connectionState === 'connected'
            ) {
                this.log(
                    'Connection with ',
                    soketID,
                    'is already established'
                );
                return;
            }

            switch (message.type) {
                case 'yayinda': // user is ready to share their stream
                    this._baglan(soketID);
                    break;
                case 'offer': // got connection offer
                    if (!this.pcs[soketID]) {
                        this._baglan(soketID);
                    }
                    this.pcs[soketID].setRemoteDescription(
                        new RTCSessionDescription(message)
                    );
                    this._answer(soketID);
                    break;
                case 'answer': // got answer for sent offer
                    this.pcs[soketID].setRemoteDescription(
                        new RTCSessionDescription(message)
                    );
                    break;
                case 'candidate': // received candidate sdp
                    this.inCall = true;
                    const candidate = new RTCIceCandidate({
                        sdpMLineIndex: message.label,
                        candidate: message.candidate,
                    });
                    this.pcs[soketID].addIceCandidate(candidate);
                    break;
            }
        });
    }

    _sendMessage(message, toId = null, odaId = null) {
        this.socket.emit('message', message, toId, odaId);
    }

    _createPeerConnection(soketID) {
        try {
            if (this.pcs[soketID]) {
                // Skip peer if connection is already established
                this.warn('Connection with ', soketID, ' already established');
                return;
            }

            this.pcs[soketID] = new RTCPeerConnection(this.pcConfig);
            this.pcs[soketID].onicecandidate = this._handleIceCandidate.bind(
                this,
                soketID
            );
            this.pcs[soketID].ontrack = this._handleOnTrack.bind(
                this,
                soketID
            );
            // this.pcs[soketID].onremovetrack = this._handleOnRemoveTrack.bind(
            //     this,
            //     soketID
            // );

            this.log('Created RTCPeerConnnection for ', soketID);
        } catch (error) {
            this.error('RTCPeerConnection failed: ' + error.message);

            this._emit('error', {
                error: new Error(`RTCPeerConnection failed: ${error.message}`),
            });
        }
    }

    /**
     * Send ICE candidate through signaling server (socket.io in this case)
     */
    _handleIceCandidate(soketID, event) {
        this.log('icecandidate event');

        if (event.candidate) {
            this._sendMessage(
                {
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate,
                },
                soketID
            );
        }
    }

    _handleCreateOfferError(event) {
        this.error('ERROR creating offer');

        this._emit('error', {
            error: new Error('Error while creating an offer'),
        });
    }

    /**
     * Make an offer
     * Creates session descripton
     */
    _makeOffer(soketID) {
        this.log('Sending offer to ', soketID);

        this.pcs[soketID].createOffer(
            this._setSendLocalDescription.bind(this, soketID),
            this._handleCreateOfferError
        );
    }

    /**
     * Create an answer for incoming offer
     */
    _answer(soketID) {
        this.log('Sending answer to ', soketID);

        this.pcs[soketID]
            .createAnswer()
            .then(
                this._setSendLocalDescription.bind(this, soketID),
                this._handleSDPError
            );
    }

    /**
     * Set local description and send it to server
     */
    _setSendLocalDescription(soketID, sessionDescription) {
        this.pcs[soketID].setLocalDescription(sessionDescription);
        this._sendMessage(sessionDescription, soketID);
    }

    _handleSDPError(error) {
        this.log('Session description error: ' + error.toString());

        this._emit('error', {
            error: new Error(`Session description error: ${error.toString()}`),
        });
    }

    _handleOnTrack(soketID, event) {
        this.log('Remote stream added for ', soketID);

        if (this.streams[soketID]?.id !== event.streams[0].id) {
            this.streams[soketID] = event.streams[0];

            this._emit('newUser', {
                soketID,
                stream: event.streams[0],
            });
        }
    }

    _handleUserLeave(soketID) {
        this.log(soketID, 'Aramadan çıkılıyor..');
        this._kullaniciAt(soketID);
        this.isInitiator = false;
    }

    _kullaniciAt(soketID = null) {
        if (!soketID) {
            // close all connections
            for (const [key, value] of Object.entries(this.pcs)) {
                this.log('Çıkış yapılıyor..', value);
                value.close();
                delete this.pcs[key];
            }
            this.streams = {};
        } else {
            if (!this.pcs[soketID]) return;
            this.pcs[soketID].close();
            delete this.pcs[soketID];

            delete this.streams[soketID];
        }

        this._emit('kullaniciAt', { soketID });
    }

    kullanici_at(soketID) {
        if (!this.adminKontrol) { //Admin mi diye sorgulama
            this._emit('notification', {
                notification: 'Admin değilsiniz',
            });
            return;
        }
        this._kullaniciAt(soketID);
        this.socket.emit('ban', soketID, this.oda);
    }
}
