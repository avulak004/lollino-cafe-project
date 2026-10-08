import express from "express";
import cors from "cors";
import http from "http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import QRCode from "qrcode";
import { Server } from "socket.io";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "qr-cafe-demo-secret-change-me";

const db = new Database("qrcafe.db");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS cafes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 5,
  open_time TEXT NOT NULL DEFAULT '08:00',
  close_time TEXT NOT NULL DEFAULT '22:00'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cafe_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(cafe_id) REFERENCES cafes(id)
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cafe_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  qr_token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'free',
  FOREIGN KEY(cafe_id) REFERENCES cafes(id)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cafe_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(cafe_id) REFERENCES cafes(id)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  photo TEXT NOT NULL DEFAULT '',
  dietary TEXT NOT NULL DEFAULT 'Veg',
  available INTEGER NOT NULL DEFAULT 1,
  best_seller INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_delta REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id INTEGER NOT NULL,
  table_id INTEGER,
  party_size INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'walk-in',
  booked_at TEXT NOT NULL,
  hold_expiry TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(guest_id) REFERENCES guests(id),
  FOREIGN KEY(table_id) REFERENCES tables(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL,
  guest_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(table_id) REFERENCES tables(id),
  FOREIGN KEY(guest_id) REFERENCES guests(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received',
  notes TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  total REAL NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  selected_modifiers TEXT NOT NULL DEFAULT '[]',
  price_at_order REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES menu_items(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  amount REAL NOT NULL,
  provider_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

function seed() {
  const cafe = db.prepare("SELECT id FROM cafes LIMIT 1").get();
  let cafeId = cafe?.id;
  if (!cafeId) {
    const r = db.prepare("INSERT INTO cafes (name,tax_rate) VALUES (?,?)").run("Lollino", 5);
    cafeId = r.lastInsertRowid;
  }

  if (!db.prepare("SELECT id FROM users WHERE email=?").get("owner@qrcafe.local")) {
    const hash = bcrypt.hashSync("owner123", 10);
    db.prepare("INSERT INTO users(cafe_id,name,email,password_hash,role) VALUES(?,?,?,?,?)")
      .run(cafeId, "Cafe Owner", "owner@qrcafe.local", hash, "owner");
  }
  if (!db.prepare("SELECT id FROM users WHERE email=?").get("staff@qrcafe.local")) {
    const hash = bcrypt.hashSync("staff123", 10);
    db.prepare("INSERT INTO users(cafe_id,name,email,password_hash,role) VALUES(?,?,?,?,?)")
      .run(cafeId, "Counter Staff", "staff@qrcafe.local", hash, "staff");
  }

  const categories = [
    ["Coffees", 1], ["Other Beverages", 2], ["Snacks", 3]
  ];
  for (const [name, sort] of categories) {
    if (!db.prepare("SELECT id FROM categories WHERE cafe_id=? AND name=?").get(cafeId,name)) {
      db.prepare("INSERT INTO categories(cafe_id,name,sort_order) VALUES(?,?,?)").run(cafeId,name,sort);
    }
  }

  const cat = Object.fromEntries(db.prepare("SELECT id,name FROM categories WHERE cafe_id=?").all(cafeId).map(x=>[x.name,x.id]));
  const menu = [
    ["Coffees","Espresso","Strong single-shot coffee",100,"Veg",1],
    ["Coffees","Americano","Espresso with hot water",120,"Veg",1],
    ["Coffees","Cappuccino","Espresso, steamed milk and foam",150,"Veg",1],
    ["Coffees","Latte","Smooth espresso with milk",160,"Veg",1],
    ["Coffees","Mocha","Chocolate espresso drink",180,"Veg",1],
    ["Coffees","South Indian Filter Coffee","Traditional filter coffee",90,"Veg",1],
    ["Coffees","Cold Brew","Slow brewed cold coffee",170,"Veg",0],
    ["Other Beverages","Masala Chai","Indian spiced tea",80,"Veg",1],
    ["Other Beverages","Green Tea","Light green tea",70,"Veg",0],
    ["Other Beverages","Hot Chocolate","Creamy chocolate drink",160,"Veg",0],
    ["Other Beverages","Fresh Lime Soda","Fresh lime with soda",90,"Veg",0],
    ["Other Beverages","Mango Smoothie","Thick mango smoothie",180,"Veg",1],
    ["Snacks","Veg Sandwich","Toasted vegetable sandwich",140,"Veg",1],
    ["Snacks","Paneer Wrap","Paneer and vegetables in a wrap",170,"Veg",1],
    ["Snacks","Samosa","Crispy potato samosa",50,"Veg",1],
    ["Snacks","French Fries","Crispy salted fries",110,"Veg",0],
    ["Snacks","Garlic Bread","Toasted garlic bread",120,"Veg",0],
    ["Snacks","Pasta","Creamy cafe pasta",190,"Veg",0],
    ["Snacks","Brownie","Chocolate brownie",120,"Veg",1],
    ["Snacks","Cheesecake","Creamy cheesecake slice",190,"Veg",0]
  ];
  const itemStmt = db.prepare("INSERT INTO menu_items(category_id,name,description,price,dietary,best_seller) VALUES(?,?,?,?,?,?)");
  for (const [c,n,d,p,veg,b] of menu) {
    if (!db.prepare("SELECT id FROM menu_items WHERE name=?").get(n)) {
      const r = itemStmt.run(cat[c],n,d,p,veg,b);
      if (["Cappuccino","Latte","Mocha"].includes(n)) {
        const g = db.prepare("INSERT INTO modifier_groups(item_id,name,required) VALUES(?,?,?)").run(r.lastInsertRowid,"Size",1);
        for (const [mn,delta] of [["Regular",0],["Large",40]]) {
          db.prepare("INSERT INTO modifier_options(group_id,name,price_delta) VALUES(?,?,?)").run(g.lastInsertRowid,mn,delta);
        }
      }
      if (["Cappuccino","Latte","Mocha","Cold Brew"].includes(n)) {
        const g = db.prepare("INSERT INTO modifier_groups(item_id,name,required) VALUES(?,?,?)").run(r.lastInsertRowid,"Milk",0);
        for (const [mn,delta] of [["Regular Milk",0],["Oat Milk",30],["Almond Milk",30]]) {
          db.prepare("INSERT INTO modifier_options(group_id,name,price_delta) VALUES(?,?,?)").run(g.lastInsertRowid,mn,delta);
        }
      }
    }
  }

  const tableCount = db.prepare("SELECT COUNT(*) c FROM tables WHERE cafe_id=?").get(cafeId).c;
  if (tableCount === 0) {
    const t = db.prepare("INSERT INTO tables(cafe_id,label,capacity,qr_token) VALUES(?,?,?,?)");
    for (let i=1;i<=8;i++) t.run(cafeId,`T${i}`,i<=4?2:4,`TABLE-${i}-${Math.random().toString(36).slice(2,9)}`);
  }
}
seed();

function auth(requiredRole=null) {
  return (req,res,next)=>{
    try {
      const token = (req.headers.authorization||"").replace("Bearer ","");
      const payload = jwt.verify(token,JWT_SECRET);
      const user = db.prepare("SELECT id,name,email,role,cafe_id,active FROM users WHERE id=?").get(payload.id);
      if (!user || !user.active) return res.status(401).json({error:"Unauthorized"});
      if (requiredRole && user.role !== requiredRole) return res.status(403).json({error:"Forbidden"});
      req.user=user; next();
    } catch { res.status(401).json({error:"Unauthorized"}); }
  };
}

function emitAll(event,data){ io.emit(event,data); }

app.get("/api/health",(req,res)=>res.json({ok:true}));
app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body;
  const user=db.prepare("SELECT * FROM users WHERE email=? AND active=1").get(email);
  if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:"Invalid credentials"});
  const token=jwt.sign({id:user.id},JWT_SECRET,{expiresIn:"8h"});
  res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
});

app.get("/api/menu",(req,res)=>{
  const cats=db.prepare("SELECT * FROM categories ORDER BY sort_order").all();
  const items=db.prepare("SELECT * FROM menu_items ORDER BY id").all().map(item=>({
    ...item,
    category_id:item.category_id,
    modifiers: db.prepare(`
      SELECT g.id group_id,g.name group_name,g.required,
             o.id option_id,o.name option_name,o.price_delta
      FROM modifier_groups g LEFT JOIN modifier_options o ON o.group_id=g.id
      WHERE g.item_id=? ORDER BY g.id,o.id
    `).all(item.id)
  }));
  res.json({categories:cats,items});
});

app.post("/api/checkin",(req,res)=>{
  const {name,phone,partySize,tableId}=req.body;
  if(!name || !phone || !partySize) return res.status(400).json({error:"Name, phone and party size are required"});
  const table = tableId
  ? db.prepare("SELECT * FROM tables WHERE id=? AND status='free' AND capacity>=?").get(tableId, partySize)
  : db.prepare("SELECT * FROM tables WHERE status='free' AND capacity>=? ORDER BY capacity").get(partySize);
  if (!table) return res.status(409).json({error:"No suitable free table"});
  const guest=db.prepare("INSERT INTO guests(name,phone) VALUES(?,?)").run(name,phone);
  const token=`sess_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  const session=db.prepare("INSERT INTO sessions(table_id,guest_id,token) VALUES(?,?,?)").run(table.id,guest.lastInsertRowid,token);
  db.prepare("UPDATE tables SET status='occupied' WHERE id=?").run(table.id);
  db.prepare("INSERT INTO bookings(guest_id,table_id,party_size,type,booked_at,status) VALUES(?,?,?,?,datetime('now'),'seated')")
    .run(guest.lastInsertRowid,table.id,partySize,"walk-in");
  emitAll("tables:changed",{});
  res.json({token,table:{id:table.id,label:table.label,capacity:table.capacity},guest:{name,phone,partySize}});
});

app.get("/api/session/:token",(req,res)=>{
  const s=db.prepare(`
    SELECT s.id,s.token,s.status,t.id table_id,t.label table_label,g.name guest_name,g.phone
    FROM sessions s JOIN tables t ON t.id=s.table_id JOIN guests g ON g.id=s.guest_id WHERE s.token=?
  `).get(req.params.token);
  if(!s) return res.status(404).json({error:"Session not found"});
  const orders=db.prepare(`
    SELECT o.*, group_concat(oi.quantity||'x '||mi.name,' | ') items
    FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN menu_items mi ON mi.id=oi.item_id
    WHERE o.session_id=? GROUP BY o.id ORDER BY o.id DESC
  `).all(s.id);
  res.json({session:s,orders});
});

app.post("/api/orders",(req,res)=>{
  const {token,items,notes=""}=req.body;
  const s=db.prepare("SELECT * FROM sessions WHERE token=? AND status='open'").get(token);
  if(!s) return res.status(401).json({error:"Invalid session"});
  if(!Array.isArray(items)||!items.length) return res.status(400).json({error:"Cart is empty"});
  let subtotal=0;
  const expanded=[];
  for(const x of items){
    const item=db.prepare("SELECT * FROM menu_items WHERE id=? AND available=1").get(x.itemId);
    if(!item) return res.status(400).json({error:`Item ${x.itemId} unavailable`});
    let unit=item.price;
    for(const m of (x.modifiers||[])) unit += Number(m.price_delta||0);
    const qty=Math.max(1,Number(x.quantity||1));
    subtotal += unit*qty;
    expanded.push({item,qty,unit,modifiers:x.modifiers||[]});
  }
  const cafe=db.prepare("SELECT * FROM cafes WHERE id=(SELECT cafe_id FROM tables WHERE id=?)").get(s.table_id);
  const tax=+(subtotal*cafe.tax_rate/100).toFixed(2);
  const total=+(subtotal+tax).toFixed(2);
  const order=db.prepare("INSERT INTO orders(session_id,notes,subtotal,tax,total) VALUES(?,?,?,?,?)").run(s.id,notes,subtotal,tax,total);
  const oi=db.prepare("INSERT INTO order_items(order_id,item_id,quantity,selected_modifiers,price_at_order) VALUES(?,?,?,?,?)");
  for(const x of expanded) oi.run(order.lastInsertRowid,x.item.id,x.qty,JSON.stringify(x.modifiers),x.unit);
  emitAll("orders:new",{orderId:order.lastInsertRowid});
  res.json({orderId:order.lastInsertRowid,subtotal,tax,total,paymentStatus:"Pending"});
});

app.post("/api/payments/demo",(req,res)=>{
  const {orderId,method="UPI"}=req.body;
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if(!order) return res.status(404).json({error:"Order not found"});
  db.prepare("UPDATE orders SET payment_status=? WHERE id=?").run(method==="counter"?"Pay at counter (unpaid)":"Paid",orderId);
  db.prepare("INSERT INTO payments(order_id,method,status,amount,provider_ref) VALUES(?,?,?,?,?)")
    .run(orderId,method,method==="counter"?"Pending":"Paid",order.total,`DEMO-${Date.now()}`);
  emitAll("orders:changed",{orderId});
  res.json({ok:true,status:method==="counter"?"Pay at counter (unpaid)":"Paid"});
});

app.get("/api/orders",auth("staff"),(req,res)=>{
  const orders=db.prepare(`
    SELECT o.*,t.label table_label,g.name guest_name,g.phone,
(SELECT party_size FROM bookings
 WHERE guest_id=s.guest_id AND table_id=s.table_id
 ORDER BY id DESC LIMIT 1) party_size
    FROM orders o JOIN sessions s ON s.id=o.session_id
    JOIN tables t ON t.id=s.table_id JOIN guests g ON g.id=s.guest_id
    ORDER BY o.id DESC
  `).all();
  for(const o of orders) {
    o.items=db.prepare(`
      SELECT oi.*,mi.name FROM order_items oi JOIN menu_items mi ON mi.id=oi.item_id WHERE oi.order_id=?
    `).all(o.id).map(x=>({...x,selected_modifiers:JSON.parse(x.selected_modifiers||"[]")}));
  }
  res.json(orders);
});
app.patch("/api/orders/:id/status",auth("staff"),(req,res)=>{
  const allowed=["Received","Preparing","Ready","Served","Cancelled"];

  if(!allowed.includes(req.body.status))
    return res.status(400).json({error:"Invalid status"});

  const orderId = Number(req.params.id);

  const order = db.prepare(
    "SELECT session_id FROM orders WHERE id=?"
  ).get(orderId);

  if(!order)
    return res.status(404).json({error:"Order not found"});

  db.prepare(
    "UPDATE orders SET status=? WHERE id=?"
  ).run(req.body.status, orderId);

  if(req.body.status === "Served" && order.session_id){

    const remaining = db.prepare(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE session_id=?
        AND status NOT IN ('Served','Cancelled')
    `).get(order.session_id).count;

    if(remaining === 0){

      const session = db.prepare(
        "SELECT table_id FROM sessions WHERE id=?"
      ).get(order.session_id);

      db.prepare(
        "UPDATE sessions SET status='closed' WHERE id=?"
      ).run(order.session_id);

      if(session?.table_id){
        db.prepare(
          "UPDATE tables SET status='free' WHERE id=?"
        ).run(session.table_id);

        emitAll("tables:changed",{});
      }
    }
  }

  emitAll("orders:changed",{orderId});

  res.json({ok:true});
});

app.patch("/api/menu/:id/availability",auth("staff"),(req,res)=>{
  db.prepare("UPDATE menu_items SET available=? WHERE id=?").run(req.body.available?1:0,req.params.id);
  emitAll("menu:changed",{});
  res.json({ok:true});
});

app.get("/api/tables",(req,res)=>{
  res.json(db.prepare("SELECT * FROM tables ORDER BY id").all());
});
app.get("/api/admin/tables", auth("owner"), (req,res)=>{
  const tables = db.prepare(`
    SELECT
      t.*,
      g.name AS guest_name,
      g.phone,
      s.created_at AS occupied_since,
      s.status AS session_status
    FROM tables t
    LEFT JOIN sessions s
  ON s.id = (
    SELECT id
    FROM sessions
    WHERE table_id = t.id
      AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 1
  )
    LEFT JOIN guests g
      ON g.id = s.guest_id
    ORDER BY t.id
  `).all();

  res.json(tables);
});
app.post("/api/admin/tables/:id/release", auth("owner"), (req, res) => {
  const tableId = req.params.id;

  db.prepare(
    "UPDATE sessions SET status='closed' WHERE table_id=? AND status='open'"
  ).run(tableId);

  db.prepare(
    "UPDATE tables SET status='free' WHERE id=?"
  ).run(tableId);

  emitAll("tables:changed", {});

  res.json({ ok: true });
});
app.post("/api/tables",auth("owner"),(req,res)=>{
  const {label,capacity}=req.body;
  const token=`TABLE-${label}-${Math.random().toString(36).slice(2,8)}`;
  const r=db.prepare("INSERT INTO tables(cafe_id,label,capacity,qr_token) VALUES(?,?,?,?)").run(req.user.cafe_id,label,capacity,token);
  res.json({id:r.lastInsertRowid});
});

app.get("/api/tables/:id/qr",auth("owner"),async(req,res)=>{
  const t=db.prepare("SELECT * FROM tables WHERE id=?").get(req.params.id);
  if(!t) return res.status(404).json({error:"Table not found"});
  const clientBase=process.env.CLIENT_URL||"http://localhost:5173";
  const url=`${clientBase}/?table=${t.id}`;
  const dataUrl=await QRCode.toDataURL(url,{width:500,margin:2});
  res.json({url,dataUrl});
});

app.get("/api/bookings",auth("staff"),(req,res)=>{
  res.json(db.prepare(`
    SELECT b.*,g.name guest_name,g.phone,t.label table_label
    FROM bookings b JOIN guests g ON g.id=b.guest_id
    LEFT JOIN tables t ON t.id=b.table_id ORDER BY b.booked_at DESC
  `).all());
});

app.post("/api/bookings",(req,res)=>{
  const {name,phone,partySize,date,time}=req.body;
  const when=`${date} ${time}:00`;
  const table=db.prepare(`
    SELECT t.* FROM tables t
    WHERE t.capacity>=?
    AND t.id NOT IN (
      SELECT table_id FROM bookings
      WHERE booked_at BETWEEN datetime(?, '-90 minutes') AND datetime(?, '+90 minutes')
      AND status IN ('booked','held','seated')
    )
    ORDER BY t.capacity LIMIT 1
  `).get(partySize,when,when);
  if(!table) return res.status(409).json({error:"No suitable table for that time"});
  const guest=db.prepare("INSERT INTO guests(name,phone) VALUES(?,?)").run(name,phone);
  const hold=new Date(new Date(`${date}T${time}:00`).getTime()+90*60000).toISOString();
  const b=db.prepare("INSERT INTO bookings(guest_id,table_id,party_size,type,booked_at,hold_expiry,status) VALUES(?,?,?,?,?,?,?)")
    .run(guest.lastInsertRowid,table.id,partySize,"pre-booked",when,hold,"booked");
  emitAll("bookings:changed",{});
  res.json({bookingId:b.lastInsertRowid,table:table.label,bookedAt:when});
});

app.post("/api/bookings/:id/cancel",auth("staff"),(req,res)=>{
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(req.params.id);
  emitAll("bookings:changed",{});
  res.json({ok:true});
});

app.get("/api/admin/menu",auth("owner"),(req,res)=>{
  res.json(db.prepare(`
    SELECT mi.*,c.name category_name FROM menu_items mi JOIN categories c ON c.id=mi.category_id ORDER BY c.sort_order,mi.id
  `).all());
});

app.post("/api/admin/menu", auth("owner"), (req,res)=>{
  const {categoryId,name,description="",price,dietary="Veg",photo=""}=req.body;
  const r=db.prepare("INSERT INTO menu_items(category_id,name,description,price,dietary,photo) VALUES(?,?,?,?,?,?)")
  .run(categoryId,name,description,price,dietary,photo);
  emitAll("menu:changed",{});
  res.json({id:r.lastInsertRowid});
});

app.patch("/api/admin/menu/:id",auth("owner"),(req,res)=>{
  const {name,description,price,dietary,available}=req.body;
  db.prepare("UPDATE menu_items SET name=?,description=?,price=?,dietary=?,available=? WHERE id=?")
    .run(name,description,price,dietary,available?1:0,req.params.id);
  emitAll("menu:changed",{});
  res.json({ok:true});
});
app.get("/api/admin/customers", auth("owner"), (req,res)=>{
  const customers = db.prepare(`
    SELECT
      g.name AS customer_name,
      g.phone,
      t.label AS table_label,
      (
        SELECT b.party_size
        FROM bookings b
        WHERE b.guest_id = s.guest_id
          AND b.table_id = s.table_id
        ORDER BY b.id DESC
        LIMIT 1
      ) AS party_size,
      s.created_at AS checkin_time,
      s.status AS session_status
    FROM sessions s
    JOIN guests g ON g.id = s.guest_id
    JOIN tables t ON t.id = s.table_id
    ORDER BY s.created_at DESC
  `).all();

  res.json(customers);
});
app.get("/api/admin/orders", auth("owner"), (req, res) => {
  const orders = db.prepare(`
    SELECT
      o.*,
      t.label AS table_label,
      g.name AS guest_name,
      g.phone
    FROM orders o
    JOIN sessions s ON s.id = o.session_id
    JOIN tables t ON t.id = s.table_id
    JOIN guests g ON g.id = s.guest_id
    ORDER BY o.created_at DESC
  `).all();

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT
        oi.*,
        mi.name
      FROM order_items oi
      JOIN menu_items mi ON mi.id = oi.item_id
      WHERE oi.order_id = ?
    `).all(o.id);
  }

  res.json(orders);
});
app.get("/api/reports",auth("owner"),(req,res)=>{
  const today=db.prepare(`
    SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue
    FROM orders WHERE payment_status='Paid' AND date(created_at)=date('now')
  `).get();
  const all=db.prepare(`
    SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue
    FROM orders WHERE payment_status='Paid'
  `).get();
  res.json({today,all});
});

app.post("/api/admin/staff",auth("owner"),(req,res)=>{
  const {name,email,password,role="staff"}=req.body;
  if(role!=="staff") return res.status(400).json({error:"Only staff accounts can be created here"});
  const hash=bcrypt.hashSync(password,10);
  try {
    const r=db.prepare("INSERT INTO users(cafe_id,name,email,password_hash,role) VALUES(?,?,?,?,?)")
      .run(req.user.cafe_id,name,email,hash,role);
    res.json({id:r.lastInsertRowid});
  } catch { res.status(409).json({error:"Email already exists"}); }
});

io.on("connection",socket=>{ socket.emit("connected",{ok:true}); });

httpServer.listen(PORT,()=>console.log(`QR Cafe API running at http://localhost:${PORT}`));
