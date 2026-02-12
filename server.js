const express = require('express');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer'); // これが必要！
const app = express();
const port = process.env.PORT || 3000;

// 接続先（あなたのデータベース）
const uri = "mongodb+srv://yukkuriikou23_db_user:Orzyuku23@cluster0.whi6gzm.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

app.use(express.static('public'));
app.use(express.json());

// メール配達員（通行証を使う設定）
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

async function connectDB() {
    try {
        await client.connect();
        return client.db("bottle_mail_db");
    } catch (e) { console.error("DB接続エラー:", e); }
}

// 1. ボトルを流す（保存と同時に配達予約）
app.post('/api/messages', async (req, res) => {
    const db = await connectDB();
    const { text, recipientEmail, delayMinutes } = req.body;
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + (parseInt(delayMinutes) || 0) * 60000);

    const newMessage = {
        text,
        recipientEmail: recipientEmail || null,
        scheduledAt: scheduledAt,
        isSent: false,
        createdAt: now
    };

    await db.collection("messages").insertOne(newMessage);
    console.log(`[新ログ] ${scheduledAt.toLocaleString()} に配達予約完了`); // このログが出るはず
    res.json({ success: true, scheduledAt });
});

// 2. 配達チェック（メールを実際に送る）
async function checkAndSendMails() {
    const db = await connectDB();
    const now = new Date();
    const pendingMails = await db.collection("messages").find({
        isSent: false,
        scheduledAt: { $lte: now }
    }).toArray();

    for (const mail of pendingMails) {
        // 安全装置：練習中は常に自分（GMAIL_USER）に送る
        const safeTarget = process.env.GMAIL_USER; 

        const mailOptions = {
            from: `"名もなき海（練習中）" <${process.env.GMAIL_USER}>`,
            to: safeTarget,
            subject: "【テスト漂着】海からのボトル",
            text: `本来の宛先: ${mail.recipientEmail || "ランダム"}\n内容：\n${mail.text}`
        };

        try {
            await transporter.sendMail(mailOptions);
            await db.collection("messages").updateOne(
                { _id: mail._id },
                { $set: { isSent: true } }
            );
            console.log(`[新ログ] メール送信成功: ${safeTarget}`);
        } catch (error) {
            console.error("[新ログ] 送信失敗:", error);
        }
    }
}

// 3. ボトルを拾う（ついでに配達も実行）
app.get('/api/random', async (req, res) => {
    await checkAndSendMails(); // これでメールが飛ぶ！
    const db = await connectDB();
    const randomMsg = await db.collection("messages").aggregate([
        { $match: { isSent: true } },
        { $sample: { size: 1 } }
    ]).toArray();
    res.json(randomMsg[0] || { text: "今は波が静かです..." });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
