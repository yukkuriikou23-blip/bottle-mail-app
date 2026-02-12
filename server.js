const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

// あなたのMongoDB接続文字列（魔法の呪文）
const uri = "mongodb+srv://yukkuriikou23_db_user:Orzyuku23@cluster0.whi6gzm.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

app.use(express.static('public'));
app.use(express.json());

// データベースに接続する関数
async function connectDB() {
    try {
        await client.connect();
        // "bottle_mail_db" というデータベースの中の "messages" という箱を使う
        return client.db("bottle_mail_db").collection("messages");
    } catch (e) {
        console.error("DB接続エラー:", e);
    }
}

// メッセージを受け取る（送信）
app.post('/api/messages', async (req, res) => {
    const collection = await connectDB();
    const newMessage = {
        text: req.body.text,
        mode: req.body.mode || 'normal',
        createdAt: new Date() // 日付も記録
    };
    
    // データベースに保存
    await collection.insertOne(newMessage);
    console.log("メッセージをデータベースに保存しました");
    res.json({ success: true });
});

// ランダムなメッセージを返す（受信）
app.get('/api/random', async (req, res) => {
    const collection = await connectDB();
    
    // データベースからランダムに1つ取り出す魔法
    const randomMsg = await collection.aggregate([{ $sample: { size: 1 } }]).toArray();

    if (randomMsg.length > 0) {
        res.json(randomMsg[0]);
    } else {
        res.json({ text: "海は静かです...（まだメッセージがありません）" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
