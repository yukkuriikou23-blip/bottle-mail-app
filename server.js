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
            try {
                // メール送信を試みる（ここで失敗してもOKにする）
                const mailOptions = {
                    from: `"名もなき海" <${process.env.GMAIL_USER}>`,
                    to: process.env.GMAIL_USER,
                    subject: "海からのボトル",
                    text: `内容：\n${mail.text}`
                };
                await transporter.sendMail(mailOptions);
                console.log("[ログ] メール送信に成功しました！");
            } catch (mailError) {
                // メールが届かなくても、エラーを無視してログだけ出す
                console.warn("[ログ] メール送信は失敗しましたが、処理を続行します:", mailError.message);
            }

            // ★ここが重要：メールの成否に関わらず、データベースでは「送信済み」にする
            await database.collection("messages").updateOne(
                { _id: mail._id },
                { $set: { isSent: true } }
            );
            console.log("[ログ] データベース上で『送信済み』に更新しました");
        }
    } catch (err) {
        console.error("[重大エラー] システムエラー:", err);
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

// ▼▼▼ 管理者用の裏機能（神の部屋） ▼▼▼

// 1. 全てのボトルを覗き見る
app.get('/api/admin/all', async (req, res) => {
    // 簡易的なパスワード認証（URLの ?key=... で判定）
    if (req.query.key !== "niigata2026") { // ★パスワードは自由に変えてね
        return res.status(403).json({ error: "立ち入り禁止区域です。" });
    }

    const db = await getDB();
    // 新しい順に全件取得
    const allMsgs = await db.collection("messages").find().sort({ _id: -1 }).toArray();
    res.json(allMsgs);
});

// 2. 指定したボトルを強制削除する
app.post('/api/admin/delete', async (req, res) => {
    if (req.body.key !== "niigata2026") {
        return res.status(403).json({ error: "権限がありません。" });
    }

    const db = await getDB();
    await db.collection("messages").deleteOne({ _id: new ObjectId(req.body.id) });
    res.json({ success: true });
});

// ▼▼▼ 管理者用の裏機能（神の部屋）ここから ▼▼▼

// 1. 全てのボトルを覗き見るAPI
app.get('/api/admin/all', async (req, res) => {
    // 合言葉（パスワード）のチェック
    if (req.query.key !== "niigata2026") {
        return res.status(403).json({ error: "立ち入り禁止区域です。" });
    }

    const db = await getDB();
    // データベースから「全ての手紙」を、新しい順（_id: -1）に取得
    const allMsgs = await db.collection("messages").find().sort({ _id: -1 }).toArray();
    res.json(allMsgs);
});

// 2. 指定したボトルを強制削除する（沈める）API
app.post('/api/admin/delete', async (req, res) => {
    // ここでも合言葉をチェック
    if (req.body.key !== "niigata2026") {
        return res.status(403).json({ error: "権限がありません。" });
    }

    const db = await getDB();
    // ObjectIdを使って、指定されたIDの手紙を消去
    await db.collection("messages").deleteOne({ _id: new ObjectId(req.body.id) });
    
    console.log(`[管理者操作] ID: ${req.body.id} の言葉が沈められました。`);
    res.json({ success: true });
});

// ▲▲▲ 管理者用コード ここまで ▲▲▲

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    getDB(); // 起動時に繋いでおく
});
