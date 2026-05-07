const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- قاعدة البيانات للـ Logs فقط ---
const db = new sqlite3.Database(':memory:'); // أو استخدم 'traffic.db' للحفظ الدائم
db.serialize(() => {
    db.run("CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, log_type TEXT, created_at INTEGER)");
});

function addLog(message, type = 'normal') {
    const ts = Math.floor(Date.now() / 1000);
    db.run("INSERT INTO logs (message, log_type, created_at) VALUES (?, ?, ?)", [message, type, ts]);
}

// --- هياكل البيانات (In-Memory) ---
let roadQueue = [];      // الطابور الرئيسي
let exitLane = [];       // حارة الخروج (للإسعاف)
let accidentCars = [];   // قائمة الحوادث
let sideRoad = [];       // طريق جانبي

// --- منطق البحث BST (Binary Search Tree) ---
class Node {
    constructor(car) {
        this.car = car;
        this.left = null;
        this.right = null;
    }
}

// Priority Queue Implementation (Min-Heap)
class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    // تحديد الأولوية: 1 للطوارئ، 2 للحوادث، 3 للعادي
    getPriority(car) {
        if (car.is_emergency) return 1;
        if (car.has_accident) return 2;
        return 3;
    }

    enqueue(car) {
        const node = { car, priority: this.getPriority(car) };
        this.heap.push(node);
        this._heapifyUp(this.heap.length - 1);
    }

    dequeue() {
        if (!this.heap.length) return null;
        const top = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this._heapifyDown(0);
        }
        return top.car;
    }

    _heapifyUp(i) {
        while (i > 0) {
            let p = Math.floor((i - 1) / 2);
            if (this.heap[p].priority > this.heap[i].priority) {
                [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
                i = p;
            } else break;
        }
    }

    _heapifyDown(i) {
        while (true) {
            let s = i, l = 2 * i + 1, r = 2 * i + 2;
            if (l < this.heap.length && this.heap[l].priority < this.heap[s].priority) s = l;
            if (r < this.heap.length && this.heap[r].priority < this.heap[s].priority) s = r;
            if (s !== i) {
                [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]];
                i = s;
            } else break;
        }
    }

    toArray() {
        // ترتيب العناصر لاسترجاعها كقائمة مرتبة للعرض
        const tempHeap = new PriorityQueue();
        tempHeap.heap = JSON.parse(JSON.stringify(this.heap));
        const result = [];
        while (tempHeap.heap.length) result.push(tempHeap.dequeue());
        return result;
    }
}

function insertBST(root, car, criteria) {
    if (!root) return new Node(car);
    if (car[criteria] < root.car[criteria]) {
        root.left = insertBST(root.left, car, criteria);
    } else {
        root.right = insertBST(root.right, car, criteria);
    }
    return root;
}

function searchBST(root, value, criteria) {
    if (!root) return null;
    if (root.car[criteria] == value) return root.car;
    if (value < root.car[criteria]) return searchBST(root.left, value, criteria);
    return searchBST(root.right, value, criteria);
}

// دالة لإيجاد أصغر قيمة في الشجرة (تُستخدم عند حذف نود بطفلين)
function findMinBST(node) {
    while (node.left !== null) node = node.left;
    return node;
}

// دالة الحذف الرئيسية من الـ BST
function deleteBST(root, value, criteria) {
    if (!root) return null;

    // البحث عن النود المراد حذفها
    if (value < root.car[criteria]) {
        root.left = deleteBST(root.left, value, criteria);
    } else if (value > root.car[criteria]) {
        root.right = deleteBST(root.right, value, criteria);
    } else {
        // حالة العثور على النود
        // الحالة 1: لا يوجد أطفال أو طفل واحد
        if (!root.left) return root.right;
        if (!root.right) return root.left;

        // الحالة 2: يوجد طفلين (نجيب أصغر قيمة في الشجرة اليمنى)
        let temp = findMinBST(root.right);
        root.car = temp.car; // نسخ البيانات
        root.right = deleteBST(root.right, temp.car[criteria], criteria); // حذف النود المكررة
    }
    return root;
}

// بناء الشجر عند الطلب للبحث
function getTrees() {
    let plateTree = null;
    let nameTree = null;
    const allCars = [...roadQueue, ...exitLane, ...accidentCars, ...sideRoad];
    allCars.forEach(car => {
        plateTree = insertBST(plateTree, car, 'plate_number');
        nameTree = insertBST(nameTree, car, 'owner_name');
    });
    return { plateTree, nameTree };
}

// --- الـ API Endpoints ---

// 1. الإحصائيات (تعديل لدعم الـ Priority Queue)
app.get('/api/stats', (req, res) => {
    // تجميع كل السيارات من كل المسارات لترتيبهم حسب الأولوية
    const pq = new PriorityQueue();
    const allCars = [...roadQueue, ...exitLane, ...accidentCars, ...sideRoad];
    allCars.forEach(car => pq.enqueue(car));

    res.json({
        on_road: roadQueue.length,
        exit_lane: exitLane.length,
        accidents: accidentCars.length,
        emergency: roadQueue.filter(c => c.is_emergency).length,
        // القائمة المرتبة حسب الأولوية (إسعاف > حوادث > عادي)
        priority_list: pq.toArray()
    });
});

// 2. جلب سيارات الطريق
app.get('/api/road', (req, res) => res.json(roadQueue));
app.get('/api/exit-lane', (req, res) => res.json(exitLane));
app.get('/api/accident-cars', (req, res) => res.json(accidentCars));

// 3. إضافة سيارة (Enqueue)
app.post('/api/road', (req, res) => {
    const { owner_name, plate_number, has_accident, is_emergency } = req.body;
    const newCar = {
        id: Date.now(),
        owner_name,
        plate_number,
        has_accident,
        is_emergency,
        status: is_emergency ? "is emergency" : (has_accident ? "has an accident" : "good")
    };

    roadQueue.push(newCar);
    addLog(`Car ${plate_number} (${owner_name}) entered the road`, is_emergency ? 'warning' : 'normal');
    res.json({ message: "Car added successfully", status: newCar.status });
});

// 4. التعامل مع الحوادث (نقل من الـ Queue إلى قائمة الحوادث)
app.post('/api/road/handle-accidents', (req, res) => {
    const moved = [];
    roadQueue = roadQueue.filter(car => {
        if (car.has_accident) {
            accidentCars.push(car);
            moved.push(car);
            return false;
        }
        return true;
    });
    if (moved.length) addLog(`Moved ${moved.length} cars to accident list`, 'danger');
    res.json({ message: moved.length ? "Accidents cleared" : "No accidents found", moved });
});

// 5. التعامل مع الطوارئ (Priority: نقل لخط الخروج)
app.post('/api/road/handle-emergency', (req, res) => {
    const moved = [];
    roadQueue = roadQueue.filter(car => {
        if (car.is_emergency) {
            exitLane.push(car);
            moved.push(car);
            return false;
        }
        return true;
    });
    if (moved.length) addLog(`Emergency vehicles ${moved.length} moved to exit lane`, 'warning');
    res.json({ message: moved.length ? "Emergency cleared" : "No emergency vehicles", moved });
});

// 6. البحث (BST)
app.get('/api/search', (req, res) => {
    const { plate, name } = req.query;
    const { plateTree, nameTree } = getTrees();
    let result = null;

    if (plate) result = searchBST(plateTree, parseInt(plate), 'plate_number');
    else if (name) result = searchBST(nameTree, name, 'owner_name');

    if (result) {
        // تحديد المكان (Logic بسيط)
        let location = "Main Road";
        if (exitLane.find(c => c.id === result.id)) location = "Exit Lane";
        if (accidentCars.find(c => c.id === result.id)) location = "Accident Area";

        res.json({ found: true, results: [{ ...result, location }] });
    } else {
        res.status(404).json({ found: false, message: "Car not found in system" });
    }
});


// 7. السجلات (Logs)
app.get('/api/log', (req, res) => {
    const limit = req.query.limit || 60;
    db.all("SELECT * FROM logs ORDER BY created_at DESC LIMIT ?", [limit], (err, rows) => {
        res.json(rows);
    });
});

app.delete('/api/road/:id', (req, res) => {
    const carId = parseInt(req.params.id);
    let targetCar = null;

    // دالة مساعدة للحذف من القوائم (Queue/Stack)
    const removeFromList = (list) => {
        const index = list.findIndex(c => c.id === carId);
        if (index !== -1) {
            targetCar = list.splice(index, 1)[0];
            return true;
        }
        return false;
    };

    // الحذف من أي مكان موجودة فيه العربية
    const removed = removeFromList(roadQueue) || 
                    removeFromList(exitLane) || 
                    removeFromList(accidentCars) || 
                    removeFromList(sideRoad);

    if (removed && targetCar) {
        // تطبيق لوجيك الـ BST: بناء الشجرة ثم حذف العنصر منها
        let { plateTree, nameTree } = getTrees();
        
        // حذف من شجرة الأرقام وشجرة الأسماء
        plateTree = deleteBST(plateTree, targetCar.plate_number, 'plate_number');
        nameTree = deleteBST(nameTree, targetCar.owner_name, 'owner_name');

        addLog(`Car ${targetCar.plate_number} removed using BST Logic`, 'normal');
        res.json({ message: "Car deleted successfully using BST logic", id: carId });
    } else {
        res.status(404).json({ message: "Car not found" });
    }
});

// تشغيل السيرفر
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Traffic Backend running on http://localhost:${PORT}`);
});