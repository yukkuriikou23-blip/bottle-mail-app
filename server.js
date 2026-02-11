const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// 簡易的な「エモい翻訳」フィルター
function pseudoTranslate(text) {
    const filters = [
        { jp: "海", en: "the deep blue sea" },
        { jp: "夜", en: "the silent night" },
        { jp: "心", en: "my soul" },
        { jp: "光", en: "a flicker of light" },
        { jp: "言葉", en: "fragments of words" }
    ];
    let translated = text;
    filters.forEach(f => {
        translated = translated.split(f.jp).join(f.en);
    });
    return `[Across the ocean] ${translated}... translated for the world.`;
}

app.post('/api/messages', (req, res) => {
    try {
        const { text, mode } = req.body;
        const messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        let processedText = text;
        if (mode === 'world') {
            // 異国の海モードなら擬似翻訳をかける
            processedText = pseudoTranslate(text);
        }

        const waitTime = mode === 'deep' ? 60000 : 0;
        messages.push({ 
            id: Date.now(), 
            text: processedText, 
            mode, 
            revealAt: Date.now() + waitTime 
        });
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.get('/api/random', (req, res) => {
    try {
        const messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const available = messages.filter(m => !m.revealAt || m.revealAt <= Date.now());
        if (available.length === 0) return res.json({ text: "波は静かです。最初の欠片を投げ込んでください。" });
        res.json(available[Math.floor(Math.random() * available.length)]);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started! http://localhost:${PORT}`);
});