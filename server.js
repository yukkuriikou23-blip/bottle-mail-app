const express = require('express');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;

const uri = "mongodb+srv://yukkuriikou23_db_user:Orzyuku23@cluster0.whi6gzm.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);
let db; // DBを使い回すための変数

app.use(express.static('public'));
app.use(express.json());

// 配達員（Nodemailer）の設定
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // 587番ポートの場合は必ずfalse
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    },
    // ▼ ここがポイント：接続の安定性を高める設定
    tls: {
        rejectUnauthorized: false, // 証明書のエラーを無視
        minVersion: "TLSv1.2"
    }
});

// DB接続を安定させる（起動時に1回だけ繋ぐ）
async function getDB() {
    if (db) return db;
    console.log("[ログ] DB接続を開始します...");
    await client.connect();
    db = client.db("bottle_mail_db");
    console.log("[ログ] DB接続に成功しました");
    return db;
}

// 配達エンジンの修正
async function checkAndSendMails() {
    console.log("[ログ] 1. 配達チェック開始");
    try {
        const database = await getDB();
        const now = new Date();
        const pendingMails = await database.collection("messages").find({
            isSent: false,
            scheduledAt: { $lte: now }
        }).toArray();

        console.log(`[ログ] 2. 配達待ちの手紙: ${pendingMails.length}通`);

        for (const mail of pendingMails) {
            console.log(`[ログ] 3. 送信試行中: ${mail.text.substring(0, 10)}...`);
            const mailOptions = {
                from: `"名もなき海" <${process.env.GMAIL_USER}>`,
                to: process.env.GMAIL_USER, // 安全装置
                subject: "海からのボトル",
                text: `内容：\n${mail.text}`
            };

            await transporter.sendMail(mailOptions);
            await database.collection("messages").updateOne(
                { _id: mail._id },
                { $set: { isSent: true } }
            );
            console.log("[ログ] 4. 送信成功！");
        }
    } catch (err) {
        console.error("[重大エラー] 配達中に爆発しました:", err);
    }
}

// --- 修正：ぐるぐる防止策を入れたルート ---
app.get('/api/random', async (req, res) => {
    console.log("[ログ] /api/random が呼ばれました");
    try {
        // メール送信を待たずに、まずDBから1つランダムに取得する
        const database = await getDB();
        const randomMsg = await database.collection("messages").aggregate([
            { $match: { isSent: true } },
            { $sample: { size: 1 } }
        ]).toArray();

        // 裏側でこっそり配達チェックを走らせる（ブラウザを待たせない）
        checkAndSendMails(); 

        res.json(randomMsg[0] || { text: "今は波が静かです..." });
    } catch (err) {
        console.error("[重大エラー] 取得失敗:", err);
        res.status(500).json({ error: "サーバーが混み合っています" });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const database = await getDB();
        const { text, recipientEmail, delayMinutes } = req.body;
        const scheduledAt = new Date(Date.now() + (parseInt(delayMinutes) || 0) * 60000);

        await database.collection("messages").insertOne({
            text, recipientEmail, scheduledAt, isSent: false, createdAt: new Date()
        });
        res.json({ success: true, scheduledAt });
    } catch (err) {
        res.status(500).json({ error: "流せませんでした" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    getDB(); // 起動時に繋いでおく
});
