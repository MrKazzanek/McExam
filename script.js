/* --- KONFIGURACJA --- */
const CONFIG = {
    // POPRAWIONY LINK (wersja RAW, a nie widok strony HTML)
    dataUrl: 'https://raw.githubusercontent.com/MrKazzanek/minewallpaper/main/data.json',
    totalQuestions: 30,
    passThreshold: 0.75,
    breakTime: 1000
};

/* --- SECURITY MODULE --- */
const Security = {
    isActive: false,
    debuggerInterval: null,

    start(nick) {
        this.isActive = true;

        // Znak wodny
        const watermark = document.getElementById('watermark');
        if(watermark) watermark.innerText = `${nick} - ${new Date().toLocaleDateString()}`;

        // 1. ZABEZPIECZENIE: Opuszczenie okna (Blur)
        window.onblur = () => {
            if (this.isActive) this.failExam("Opuszczenie okna egzaminu (Alt+Tab / Kliknięcie poza)");
        };

        // 2. ZABEZPIECZENIE: Blokada klawiszy (F12, Ctrl+Shift+I itp.)
        document.addEventListener('keydown', (e) => {
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) ||
                (e.ctrlKey && e.key.toUpperCase() === 'U') ||
                (e.ctrlKey && e.key.toUpperCase() === 'S')
            ) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });

        // 3. ZABEZPIECZENIE: Pętla Debuggera (Anty-Konsola)
        // Jeśli użytkownik otworzy konsolę, przeglądarka zatrzyma działanie strony w tym miejscu
        this.debuggerInterval = setInterval(() => {
            const start = performance.now();
            debugger;
            if (performance.now() - start > 100) {
                // Wykryto, że debugger zatrzymał czas (konsola otwarta)
                this.failExam("Wykryto aktywne narzędzia developerskie");
            }
        }, 1000);

        // 4. ZABEZPIECZENIE: Anty-Screenshot (PrintScreen)
        document.addEventListener('keyup', (e) => {
            if (e.key === 'PrintScreen') {
                this.obscureScreen();
                // Opcjonalnie: można tu też zakończyć egzamin, jeśli chcesz być bardzo surowy
                // this.failExam("Próba zrzutu ekranu");
            }
        });
    },

    obscureScreen() {
        const guard = document.getElementById('screenshot-guard');
        if (guard) {
            guard.classList.remove('hidden');
            setTimeout(() => {
                guard.classList.add('hidden');
            }, 2000);
        }
    },

    stop() {
        this.isActive = false;
        window.onblur = null;
        if (this.debuggerInterval) clearInterval(this.debuggerInterval);
    },

    failExam(reason) {
        if (!this.isActive) return; // Zapobiega wielokrotnemu wywołaniu

        this.stop();
        Game.stopTimer();
        Recorder.stop();

        const container = document.querySelector('.container');
        if (container) container.classList.add('hidden');

        const failScreen = document.getElementById('screen-fail');
        const reasonText = document.getElementById('fail-reason');

        if (failScreen) failScreen.classList.remove('hidden');
        if (reasonText) reasonText.innerText = `Powód: ${reason}`;
    }
};

/* --- RECORDER MODULE --- */
const Recorder = {
    mediaRecorder: null,
    chunks: [],

    async start() {
        try {
            // Wymuszenie wyboru ekranu (najlepiej jak przeglądarka pozwala)
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: "monitor" }, // Sugeruje cały monitor
                audio: false
            });

            // Jeśli użytkownik anuluje nagrywanie w trakcie (pasek przeglądarki)
            stream.getVideoTracks()[0].onended = () => {
                if (Security.isActive) Security.failExam("Zatrzymano udostępnianie ekranu");
            };

            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = e => {
                if(e.data.size > 0) this.chunks.push(e.data);
            };
            this.mediaRecorder.start();
            return true;
        } catch (err) {
            console.error(err);
            alert("Brak zgody na nagrywanie uniemożliwia start egzaminu. Odśwież stronę i wybierz ekran.");
            return false;
        }
    },

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    },

    download(nick) {
        if (this.chunks.length === 0) return alert("Brak nagrania (może egzamin trwał za krótko?).");
        const blob = new Blob(this.chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `egzamin_${nick}_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    }
};

/* --- GAME ENGINE --- */
const Game = {
    questions: [],
    currentIdx: 0,
    score: 0,
    maxScore: 0,
    nick: '',
    timerInterval: null,
    userAnswer: null,

    async init() {
        const btnStart = document.getElementById('btn-start');
        const inpNick = document.getElementById('user-nick');
        const chkRules = document.getElementById('accept-rules');
        const btnSubmit = document.getElementById('btn-submit');
        const btnDownload = document.getElementById('btn-download');

        const validateStart = () => {
            btnStart.disabled = !(inpNick.value.trim().length > 0 && chkRules.checked);
        };
        inpNick.addEventListener('input', validateStart);
        chkRules.addEventListener('change', validateStart);

        btnStart.addEventListener('click', async () => {
            this.nick = inpNick.value.trim();
            btnStart.disabled = true;
            btnStart.innerText = "Ładowanie pytań...";
            document.getElementById('load-error').classList.add('hidden');

            // 1. Pobierz dane
            const loaded = await this.loadQuestions();
            if (!loaded) {
                btnStart.innerText = "Błąd pobierania";
                // Nie odblokowujemy przycisku, zmuszamy do refreshu
                return;
            }

            // 2. Nagrywanie
            btnStart.innerText = "Oczekiwanie na ekran...";
            const isRecording = await Recorder.start();
            if (!isRecording) {
                btnStart.disabled = false;
                btnStart.innerText = "Rozpocznij Egzamin";
                return;
            }

            // 3. Start
            document.getElementById('screen-login').classList.add('hidden');
            Security.start(this.nick);
            this.nextQuestion();
        });

        if(btnSubmit) btnSubmit.addEventListener('click', () => this.submitAnswer());
        if(btnDownload) btnDownload.addEventListener('click', () => Recorder.download(this.nick));
    },

    async loadQuestions() {
        try {
            console.log("Pobieranie z:", CONFIG.dataUrl);
            const response = await fetch(CONFIG.dataUrl);

            if (!response.ok) {
                throw new Error(`Błąd HTTP: ${response.status}`);
            }

            const rawData = await response.json();

            // Walidacja ilości pytań
            if (!Array.isArray(rawData) || rawData.length < 30) {
                alert(`Błąd: Plik JSON zawiera tylko ${rawData ? rawData.length : 0} pytań (wymagane 30).`);
                return false;
            }

            // Logika wyboru pytań
            const matching = rawData.filter(q => q.type === 'match');
            const others = rawData.filter(q => q.type !== 'match');

            this.shuffle(matching);
            this.shuffle(others);

            // 2-4 pytania dopasowania
            const matchCount = Math.floor(Math.random() * 3) + 2;
            const selectedMatch = matching.slice(0, matchCount);

            // Reszta
            const othersCount = CONFIG.totalQuestions - selectedMatch.length;
            const selectedOthers = others.slice(0, othersCount);

            this.questions = [...selectedMatch, ...selectedOthers];
            this.shuffle(this.questions);

            // Max punktów
            this.maxScore = 0;
            this.questions.forEach(q => {
                if (q.type === 'multi' || q.type === 'match') this.maxScore += 2;
                else this.maxScore += 1;
            });

            return true;
        } catch (e) {
            console.error("Szczegóły błędu:", e);
            const errorMsg = document.getElementById('load-error');
            errorMsg.innerText = `Błąd: Nie można pobrać pytań. Sprawdź konsolę (F12) jeśli możesz lub upewnij się, że plik JSON jest publiczny. ${e.message}`;
            errorMsg.classList.remove('hidden');
            return false;
        }
    },

    nextQuestion() {
        if (!Security.isActive) return;

        if (this.currentIdx >= this.questions.length) {
            this.finishExam();
            return;
        }

        document.getElementById('screen-question').classList.add('hidden');
        document.getElementById('screen-break').classList.remove('hidden');

        setTimeout(() => {
            if (!Security.isActive) return;
            document.getElementById('screen-break').classList.add('hidden');
            document.getElementById('screen-question').classList.remove('hidden');
            this.renderQuestion();
        }, CONFIG.breakTime);
    },

    renderQuestion() {
        const q = this.questions[this.currentIdx];
        this.userAnswer = null;

        document.getElementById('ui-progress').innerText = `${this.currentIdx + 1} / ${CONFIG.totalQuestions}`;
        document.getElementById('q-text').innerText = q.question;

        // Header Setup
        const header = document.getElementById('type-header');
        header.className = 'question-type-header'; // reset

        let typeText = "";
        if (q.type === 'single') { header.classList.add('type-single'); typeText = "Pojedynczy Wybór (1 pkt)"; }
        else if (q.type === 'multi') { header.classList.add('type-multi'); typeText = "Wielokrotny Wybór (2 pkt)"; }
        else if (q.type === 'bool') { header.classList.add('type-bool'); typeText = "Prawda / Fałsz (1 pkt)"; }
        else if (q.type === 'match') { header.classList.add('type-match'); typeText = "Dopasowywanie (2 pkt)"; }
        header.innerText = typeText;

        const container = document.getElementById('q-options');
        container.innerHTML = '';
        container.className = 'options-container';

        // Renderowanie opcji
        if (q.type === 'single') {
            const opts = [...q.answers];
            this.shuffle(opts);
            opts.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerText = opt;
                btn.onclick = () => {
                    container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.userAnswer = opt;
                };
                container.appendChild(btn);
            });
        }
        else if (q.type === 'bool') {
            container.classList.add('bool-container');
            ['Fałsz', 'Prawda'].forEach(val => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerText = val;
                btn.onclick = () => {
                    container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.userAnswer = val;
                };
                container.appendChild(btn);
            });
        }
        else if (q.type === 'multi') {
            this.userAnswer = [];
            const opts = [...q.answers];
            this.shuffle(opts);
            opts.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerText = opt;
                btn.onclick = () => {
                    if (this.userAnswer.includes(opt)) {
                        this.userAnswer = this.userAnswer.filter(x => x !== opt);
                        btn.classList.remove('selected');
                    } else {
                        this.userAnswer.push(opt);
                        btn.classList.add('selected');
                    }
                };
                container.appendChild(btn);
            });
        }
        else if (q.type === 'match') {
            this.userAnswer = {};
            const grid = document.createElement('div');
            grid.className = 'match-grid';

            const leftCol = document.createElement('div'); leftCol.className = 'match-col';
            const rightCol = document.createElement('div'); rightCol.className = 'match-col';

            const keys = Object.keys(q.pairs);
            const values = Object.values(q.pairs);
            this.shuffle(values);

            let selLeft = null;
            let selRight = null;

            const tryPair = () => {
                if (selLeft && selRight) {
                    this.userAnswer[selLeft.dataset.val] = selRight.dataset.val;
                    selLeft.classList.remove('selected');
                    selRight.classList.remove('selected');
                    selLeft.classList.add('paired');
                    selRight.classList.add('paired');
                    selLeft = null;
                    selRight = null;
                }
            };

            keys.forEach(k => {
                const card = document.createElement('div');
                card.className = 'match-card';
                card.innerText = k;
                card.dataset.val = k;
                card.onclick = () => {
                    if (card.classList.contains('paired')) return;
                    if (selLeft) selLeft.classList.remove('selected');
                    selLeft = card;
                    card.classList.add('selected');
                    tryPair();
                };
                leftCol.appendChild(card);
            });

            values.forEach(v => {
                const card = document.createElement('div');
                card.className = 'match-card';
                card.innerText = v;
                card.dataset.val = v;
                card.onclick = () => {
                    if (card.classList.contains('paired')) return;
                    if (selRight) selRight.classList.remove('selected');
                    selRight = card;
                    card.classList.add('selected');
                    tryPair();
                };
                rightCol.appendChild(card);
            });

            grid.appendChild(leftCol);
            grid.appendChild(rightCol);
            container.appendChild(grid);
        }

        this.runTimer(q.time);
    },

    runTimer(seconds) {
        if (this.timerInterval) clearInterval(this.timerInterval);

        const fill = document.getElementById('timer-fill');
        const text = document.getElementById('ui-timer');
        let timeLeft = seconds;

        fill.style.transition = 'none';
        fill.style.transform = 'scaleX(1)';
        void fill.offsetWidth;
        fill.style.transition = `transform ${seconds}s linear`;
        fill.style.transform = 'scaleX(0)';

        text.innerText = `Czas: ${timeLeft}s`;

        this.timerInterval = setInterval(() => {
            timeLeft--;
            text.innerText = `Czas: ${timeLeft}s`;
            if (timeLeft <= 0) {
                this.submitAnswer();
            }
        }, 1000);
    },

    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    },

    submitAnswer() {
        this.stopTimer();
        const q = this.questions[this.currentIdx];
        let earned = 0;

        if (q.type === 'single' || q.type === 'bool') {
            if (this.userAnswer && q.correct.includes(this.userAnswer)) earned = 1;
        }
        else if (q.type === 'multi') {
            if (this.userAnswer && this.userAnswer.length === q.correct.length) {
                const s1 = [...this.userAnswer].sort().join('|');
                const s2 = [...q.correct].sort().join('|');
                if (s1 === s2) earned = 2;
            }
        }
        else if (q.type === 'match') {
            if (this.userAnswer) {
                const keys = Object.keys(q.pairs);
                let ok = true;
                keys.forEach(k => {
                    if (this.userAnswer[k] !== q.pairs[k]) ok = false;
                });
                if (ok && Object.keys(this.userAnswer).length === keys.length) earned = 2;
            }
        }

        this.score += earned;
        this.currentIdx++;
        this.nextQuestion();
    },

    finishExam() {
        Security.stop();
        Recorder.stop();

        document.getElementById('screen-question').classList.add('hidden');
        document.getElementById('screen-result').classList.remove('hidden');

        const percent = this.maxScore > 0 ? Math.round((this.score / this.maxScore) * 100) : 0;
        const passed = (this.score / this.maxScore) >= CONFIG.passThreshold;

        const circle = document.getElementById('score-circle');
        circle.innerText = `${percent}%`;

        const verdict = document.getElementById('final-verdict');
        if (passed) {
            verdict.innerText = "Egzamin Zdany!";
            verdict.style.color = "var(--success)";
            circle.style.borderColor = "var(--success)";
            circle.style.color = "var(--success)";
        } else {
            verdict.innerText = "Niezaliczony";
            verdict.style.color = "var(--danger)";
            circle.style.borderColor = "var(--danger)";
            circle.style.color = "var(--danger)";
        }

        document.getElementById('final-points').innerText = `Wynik: ${this.score} / ${this.maxScore} pkt`;
    },

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
};

// Start
Game.init();