import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import "./style.css";

const API = "http://localhost:4000/api";
const socket = io("http://localhost:4000");

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

function Layout({ children, title = "Lollino Cafe" }) {
  return (
    <div className="app">
      <header>
        <div className="brand">
  <div className="brand-main">
    <img src="/images/logo.png" alt="Lollino Café" className="brand-logo" />
    <b>{title}</b>
  </div>

  <small>COFFEE • BAKES • MORE</small>
</div>
        <a href="/">Customer</a>
        <a href="/staff">Staff</a>
        <a href="/owner">Owner</a>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Login({ role }) {
  const nav = useNavigate();
  const [email, setEmail] = useState(
    role === "owner" ? "owner@qrcafe.local" : "staff@qrcafe.local"
  );
  const [password, setPassword] = useState(
    role === "owner" ? "owner123" : "staff123"
  );
  const [err, setErr] = useState("");

  async function login(e) {
    e.preventDefault();
    try {
      const r = await axios.post(API + "/auth/login", { email, password });
      localStorage.setItem("token", r.data.token);
      localStorage.setItem("role", r.data.user.role);
      nav(role === "owner" ? "/owner" : "/staff");
    } catch (x) {
      setErr(x.response?.data?.error || "Login failed");
    }
  }

  return (
    <Layout>
      <div className="card narrow">
        <h1>{role === "owner" ? "Owner" : "Staff"} Login</h1>
        <form onSubmit={login}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button>Sign in</button>
        </form>
        <p className="error">{err}</p>
        <p className="hint">
          Demo:{" "}
          {role === "owner"
            ? "owner@qrcafe.local / owner123"
            : "staff@qrcafe.local / staff123"}
        </p>
      </div>
    </Layout>
  );
}

function Customer() {
  const location = useLocation();
  const tableParam = new URLSearchParams(location.search).get("table");

  const [step, setStep] = useState("checkin");
  const [form, setForm] = useState({ name: "", phone: "", partySize: 2 });
  const [selectedTable, setSelectedTable] = useState("");
  const [tables, setTables] = useState([]);
  const [session, setSession] = useState(
    JSON.parse(localStorage.getItem("cafeSession") || "null")
  );
  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState("");
  const [payOrder, setPayOrder] = useState(null);
  const [booking, setBooking] = useState({
    name: "",
    phone: "",
    partySize: 2,
    date: "",
    time: "",
  });
  const [customItem, setCustomItem] = useState(null);
  const [customSelections, setCustomSelections] = useState({});

  async function load() {
    try {
      const r = await axios.get(API + "/menu");
      setMenu(r.data);
      const t = await axios.get(API + "/tables");
      setTables(t.data);

      if (session?.token) {
        const s = await axios.get(API + "/session/" + session.token);
        setOrders(s.data.orders || []);
      }
    } catch (e) {
      setMsg("Unable to load cafe data.");
    }
  }

  useEffect(() => {
    load();
    const fn = () => load();
    socket.on("orders:changed", fn);
    socket.on("menu:changed", fn);

    return () => {
      socket.off("orders:changed", fn);
      socket.off("menu:changed", fn);
    };
  }, [session]);

  const visible = useMemo(
    () =>
      menu.items.filter(
        (i) =>
          (cat === "all" || String(i.category_id) === cat) &&
          i.available &&
          (i.name.toLowerCase().includes(search.toLowerCase()) ||
            i.description.toLowerCase().includes(search.toLowerCase()))
      ),
    [menu, cat, search]
  );

  function getCustomGroups(item) {
    const categoryName =
      menu.categories
        .find((c) => c.id === item.category_id)
        ?.name?.toLowerCase() || "";

    if (categoryName.includes("snack")) {
      return [
        {
          name: "Size",
          options: [
            { name: "Regular", price: 0 },
            { name: "Large", price: 30 },
          ],
        },
        {
          name: "Spice Level",
          options: [
            { name: "Mild", price: 0 },
            { name: "Medium", price: 0 },
            { name: "Spicy", price: 0 },
          ],
        },
        {
          name: "Extras",
          options: [
            { name: "None", price: 0 },
            { name: "Extra cheese", price: 20 },
            { name: "Extra sauce", price: 10 },
          ],
        },
      ];
    }

    return [
      {
        name: "Size",
        required: true,
        options: [
          { name: "Regular", price: 0 },
          { name: "Large", price: 40 },
        ],
      },
      {
        name: "Milk",
        options: [
          { name: "Regular Milk", price: 0 },
          { name: "Oat Milk", price: 30 },
          { name: "Almond Milk", price: 30 },
        ],
      },
      {
        name: "Sugar",
        options: [
          { name: "Regular", price: 0 },
          { name: "Less sugar", price: 0 },
          { name: "No sugar", price: 0 },
        ],
      },
      {
        name: "Hot / Iced",
        options: [
          { name: "Hot", price: 0 },
          { name: "Iced", price: 0 },
        ],
      },
      {
        name: "Extra Shots",
        options: [
          { name: "None", price: 0 },
          { name: "1 extra shot", price: 30 },
          { name: "2 extra shots", price: 50 },
        ],
      },
    ];
  }

  async function checkin(e) {
    e.preventDefault();
    if (!selectedTable && !tableParam) {
  setMsg("Please select a table");
  return;
}
    try {
      const r = await axios.post(API + "/checkin", {
  ...form,
  tableId: selectedTable || tableParam || undefined,
});

      const s = { token: r.data.token, table: r.data.table };
      localStorage.setItem("cafeSession", JSON.stringify(s));
      setSession(s);
      setStep("menu");
    } catch (x) {
      setMsg(x.response?.data?.error || "Check-in failed");
    }
  }

  function openCustomize(item) {
    const groups = getCustomGroups(item);
    const defaults = {};

    groups.forEach((g) => {
      defaults[g.name] = g.options[0];
    });

    setCustomItem({
      ...item,
      groups,
    });
    setCustomSelections(defaults);
  }

  function addCustomized() {
    if (!customItem) return;

    const modifiers = customItem.groups.map((g) => ({
      group_name: g.name,
      name: customSelections[g.name]?.name || g.options[0].name,
      price_delta: Number(customSelections[g.name]?.price || 0),
    }));

    const extra = modifiers.reduce(
      (sum, m) => sum + m.price_delta,
      0
    );

    setCart((current) => [
      ...current,
      {
        itemId: customItem.id,
        name: customItem.name,
        quantity: 1,
        unitPrice: Number(customItem.price) + extra,
        modifiers,
      },
    ]);

    setCustomItem(null);
  }

  async function place() {
    if (!cart.length || !session?.token) return;

    try {
      const r = await axios.post(API + "/orders", {
        token: session.token,
        items: cart.map((x) => ({
          itemId: x.itemId,
          quantity: x.quantity,
          modifiers: x.modifiers,
        })),
        notes: "",
      });

      setCart([]);
      setPayOrder(r.data);
      setStep("payment");
    } catch (x) {
      setMsg(x.response?.data?.error || "Order failed");
    }
  }

  async function pay(method) {
    await axios.post(API + "/payments/demo", {
      orderId: payOrder.orderId,
      method,
    });
    setStep("status");
    load();
  }

  async function book(e) {
    e.preventDefault();
    try {
      await axios.post(API + "/bookings", booking);
      setMsg("Table booked successfully.");
    } catch (x) {
      setMsg(x.response?.data?.error || "Booking failed");
    }
  }

  if (step === "checkin") {
    return (
      <Layout>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-tag">☕ SMART QR TABLE DINING</span>
            <h1>
  Good Coffee.<br />
  <em>Great Food.</em><br />
  Your Table.
</h1>
           <p>
  Scan the QR, explore our menu, customize your order, and enjoy your café
  experience without waiting in line.
</p>
          </div>
        </section>

        <div className="grid2">
          <div className="card">
            <h2>Check in</h2>
            <form onSubmit={checkin}>
              <input
                placeholder="Your name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
              <input
                placeholder="Phone number"
                required
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
              />
              <input
                type="number"
                min="1"
                max="12"
                value={form.partySize}
                onChange={(e) =>
                  setForm({ ...form, partySize: e.target.value })
                }
              /><h3>Select your table</h3>

<div className="table-select">
  {tables.map((table) => (
    <button
  type="button"
  className={
    selectedTable === String(table.id)
      ? "selected-table"
      : table.status !== "free"
      ? "occupied-table"
      : ""
  }
  onClick={() => setSelectedTable(String(table.id))}
  disabled={table.status !== "free"}
  key={table.id}
>
  {table.label}
  {table.status !== "free" ? " 🔴 Occupied" : " 🟢 Available"}
</button>
  ))}
</div>

<p>
  Selected table: {selectedTable ? `T${selectedTable}` : "None"}
</p>
              <button>Find table & open menu</button>
              <p className="error">{msg}</p>
            </form>
          </div>

          <div className="card">
            <h2>Book for later</h2>
            <form onSubmit={book}>
              <input
                placeholder="Name"
                required
                value={booking.name}
                onChange={(e) =>
                  setBooking({ ...booking, name: e.target.value })
                }
              />
              <input
                placeholder="Phone"
                required
                value={booking.phone}
                onChange={(e) =>
                  setBooking({ ...booking, phone: e.target.value })
                }
              />
              <input
                type="number"
                value={booking.partySize}
                onChange={(e) =>
                  setBooking({ ...booking, partySize: e.target.value })
                }
              />
              <input
                type="date"
                required
                value={booking.date}
                onChange={(e) =>
                  setBooking({ ...booking, date: e.target.value })
                }
              />
              <input
                type="time"
                required
                value={booking.time}
                onChange={(e) =>
                  setBooking({ ...booking, time: e.target.value })
                }
              />
              <button>Book table</button>
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  if (step === "payment") {
    return (
      <Layout>
        <div className="card">
          <h1>Payment</h1>
          <h2>{money(payOrder?.total)}</h2>
          <button onClick={() => pay("UPI")}>Pay with UPI</button>{" "}
          <button onClick={() => pay("card")}>Pay by Card</button>{" "}
          <button onClick={() => pay("counter")}>Pay at Counter</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="toprow">
        <div>
          <h1>Menu · {session?.table?.label}</h1>
          <p>Choose your favorites and customize them your way.</p>
        </div>
        <button onClick={() => setStep("status")}>My Orders</button>
      </div>

      <div className="filters">
        <input
          placeholder="Search menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => setCat("all")}>All</button>
        {menu.categories.map((c) => (
          <button key={c.id} onClick={() => setCat(String(c.id))}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="menu">
        {visible.map((item) => (
          <div className="item card" data-name={item.name} key={item.id}>
  {item.photo && (
    <img
      src={item.photo}
      alt={item.name}
      className="item-photo"
    />
  )}

  <div>
              <span className="pill">{item.dietary}</span>
              {item.best_seller && (
                <span className="pill best">Best seller</span>
              )}
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <b>{money(item.price)}</b>
            </div>
            <button onClick={() => openCustomize(item)}>Customize</button>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="cart">
          <b>{cart.length} item(s) in cart</b>
          <button onClick={place}>Place Order</button>
        </div>
      )}

      {customItem && (
        <div className="modal">
          <div className="card customize-card">
            <div className="toprow">
              <div>
                <h2>Customize {customItem.name}</h2>
                <p>{customItem.description}</p>
              </div>
              <button onClick={() => setCustomItem(null)}>×</button>
            </div>

            {customItem.groups.map((group) => (
              <div key={group.name} className="modifier-group">
                <div className="modifier-title">
                  <b>{group.name}</b>
                  {group.required && <span className="required">Required</span>}
                </div>

                <div className="modifier-options">
                  {group.options.map((option) => (
                    <button
                      key={option.name}
                      className={
                        customSelections[group.name]?.name === option.name
                          ? "option active"
                          : "option"
                      }
                      onClick={() =>
                        setCustomSelections({
                          ...customSelections,
                          [group.name]: option,
                        })
                      }
                    >
                      {option.name}
                      {option.price
                        ? ` + ${money(option.price)}`
                        : ""}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={addCustomized}>Add to cart</button>
          </div>
        </div>
      )}

      {step === "status" && (
        <div className="modal">
          <div className="card">
            <h2>Order Status</h2>
            {orders.length ? (
              orders.map((o) => (
                <div key={o.id} className="order">
                  <b>Order #{o.id}</b>
                  <p>{o.items}</p>
                  <strong>{money(o.total)}</strong>
                  <div className="status">{o.status}</div>
                </div>
              ))
            ) : (
              <p>No orders yet.</p>
            )}
            <button onClick={() => setStep("menu")}>Back to menu</button>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Staff() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());

  async function load() {
    const r = await axios.get(API + "/orders", { headers });
    setOrders(r.data);
  }

  useEffect(() => {
    load();
    socket.on("orders:changed", load);
    socket.on("orders:new", load);
    return () => {
      socket.off("orders:changed", load);
      socket.off("orders:new", load);
    };
  }, []);
  useEffect(() => {
  const timer = setInterval(() => {
    setNow(Date.now());
  }, 60000);

  return () => clearInterval(timer);
}, []);

  async function status(id, next) {
    await axios.patch(API + "/orders/" + id + "/status", { status: next }, { headers });
    load();
  }

  return (
    <Layout>
      <h1>Staff / Kitchen Dashboard</h1>

      <div className="kanban">
        {["Received", "Preparing", "Ready", "Served"].map((s) => (
          <div className="column" key={s}>
            <h2>{s}</h2>

            {orders
              .filter((o) => o.status === s)
              .map((o) => (
                <div className="card order" key={o.id}>
                  <b>#{o.id} · {o.table_label}</b>

<p><b>Customer:</b> {o.guest_name}</p>
<p><b>Phone:</b> {o.phone}</p>
<p><b>People:</b> {o.party_size || "—"}</p>
<p>
  <b>Order time:</b>{" "}
  {o.created_at
    ? (() => {
        const mins = Math.max(
          0,
          Math.floor((now - new Date(o.created_at).getTime()) / 60000)
        );
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;

        return hours > 0
          ? `${hours} hr${hours > 1 ? "s" : ""} ${minutes} min ago`
          : `${minutes} min ago`;
      })()
    : "—"}
</p>
                  {o.items.map((i) => (
                    <div key={i.id}>
                      {i.quantity} × {i.name}
                      {i.selected_modifiers?.length > 0 && (
                        <small>
                          {i.selected_modifiers
                            .map((m) => m.name)
                            .join(" • ")}
                        </small>
                      )}
                    </div>
                  ))}

                  {s !== "Served" && (
                    <button
                      onClick={() =>
                        status(
                          o.id,
                          s === "Received"
                            ? "Preparing"
                            : s === "Preparing"
                            ? "Ready"
                            : "Served"
                        )
                      }
                    >
                      {s === "Received"
                        ? "Start"
                        : s === "Preparing"
                        ? "Ready"
                        : "Serve"}
                    </button>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    </Layout>
  );
}

function Owner() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState("menu");
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [ownerOrders, setOwnerOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState("");
const [orderStatus, setOrderStatus] = useState("All");
const [orderDate, setOrderDate] = useState("All");  
  const [report, setReport] = useState({
    today: { revenue: 0, orders: 0 },
    all: { revenue: 0, orders: 0 },
  });

  const [form, setForm] = useState({
  name: "",
  description: "",
  price: 100,
  categoryId: 1,
  photo: ""
});

  async function loadMenu() {
    const r = await axios.get(API + "/admin/menu", { headers });
    setItems(r.data);
  }

  async function loadTables() {
  try {
    const r = await axios.get(API + "/admin/tables", { headers });
    setTables(r.data);
  } catch (e) {
    console.error("Tables error:", e);
  }
}
async function releaseTable(table) {
  const ok = window.confirm(
    `Release ${table.label} and make it free?`
  );

  if (!ok) return;

  try {
    await axios.post(
      API + "/admin/tables/" + table.id + "/release",
      {},
      { headers }
    );

    loadTables();
  } catch (e) {
    console.error("Release table error:", e);
    alert("Could not release table");
  }
} 
async function loadCustomers() {
  try {
    const r = await axios.get(API + "/admin/customers", { headers });
    setCustomers(r.data);
  } catch (e) {
    console.error("Customers error:", e);
  }
}
async function loadOwnerOrders() {
  try {
    const r = await axios.get(API + "/admin/orders", { headers });
    setOwnerOrders(r.data);
  } catch (e) {
    console.error("Orders error:", e);
  }
}
  async function loadReport() {
    const r = await axios.get(API + "/reports", { headers });
    setReport(r.data);
  }
  async function showQR(table) {
  try {
    const r = await axios.get(
      API + "/tables/" + table.id + "/qr",
      { headers }
    );

    const win = window.open("", "_blank");

    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>${table.label} QR</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:40px;">
            <h1>Lollino Café</h1>
            <h2>${table.label}</h2>
            <img src="${r.data.dataUrl}" style="width:400px;height:400px;" />
            <p>Scan to open the menu</p>
          </body>
        </html>
      `);
      win.document.close();
    }
  } catch (e) {
    console.error("QR error:", e);
    alert("Could not generate QR");
  }
}

  async function load() {
  try {
    await Promise.all([
      loadMenu(),
      loadTables(),
      loadCustomers(),
      loadOwnerOrders(),
      loadReport(),
    ]);
  } catch (e) {
    console.error(e);
  }
}

  useEffect(() => {
    load();
  }, []);

  async function addItem(e) {
    e.preventDefault();

   await axios.post(
  API + "/admin/menu",
  {
    name: form.name,
    description: form.description,
    price: Number(form.price),
    categoryId: Number(form.categoryId),
    photo: form.photo,
  },
  { headers }
);
    setForm({
      name: "",
      description: "",
      price: 100,
      categoryId: 1,
      photo: "",
    });

    loadMenu();
  }

  async function toggleItem(item) {
    await axios.patch(
      API + "/admin/menu/" + item.id,
      { available: !item.available },
      { headers }
    );

    loadMenu();
  }

  async function showQR(table) {
  try {
    const r = await axios.get(
      API + "/tables/" + table.id + "/qr",
      { headers }
    );

    const win = window.open("", "_blank");

    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>${table.label} QR</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:40px;">
            <h1>Lollino Café</h1>
            <h2>${table.label}</h2>
            <img src="${r.data.dataUrl}" style="width:400px;height:400px;" />
            <p>Scan to open the menu</p>
          </body>
        </html>
      `);
      win.document.close();
    }
  } catch (e) {
    console.error("QR error:", e);
    alert("Could not generate QR");
  }
}

  return (
    <Layout>
      <div className="toprow">
        <h1>Owner Dashboard</h1>

        <button
          onClick={() => {
            localStorage.clear();
            window.location.href = "/owner";
          }}
        >
          Logout
        </button>
      </div>

      <div className="filters">
        <button onClick={() => setTab("menu")}>
          Menu
        </button>

        <button onClick={() => setTab("tables")}>
          Tables & QR
        </button>
        <button onClick={() => setTab("customers")}>
          Customers
        </button> 
        <button onClick={() => setTab("orders")}>
  Orders
</button>

        <button onClick={() => setTab("reports")}>
          Reports
        </button>
      </div>

      {tab === "menu" && (
        <>
          <div className="card">
            <h2>Add item</h2>

            <form onSubmit={addItem}>
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                required
              />

              <input
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
              />

              <input
                type="number"
                value={form.price}
                onChange={(e) =>
                  setForm({
                    ...form,
                    price: e.target.value,
                  })
                }
                required
              />

              <select
                value={form.categoryId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    categoryId: e.target.value,
                  })
                }
              >
                <option value="1">Coffees</option>
                <option value="2">Other Beverages</option>
                <option value="3">Snacks</option>
              </select>
              <label>Photo</label>

<select
  value={form.photo}
  onChange={(e) =>
    setForm({ ...form, photo: e.target.value })
  }
>
  <option value="">Select a photo</option>
  <option value="/images/espresso.jpg">Espresso</option>
  <option value="/images/americano.jpg">Americano</option>
  <option value="/images/cappuccino.jpg">Cappuccino</option>
  <option value="/images/latte.jpg">Latte</option>
  <option value="/images/mocha.jpg">Mocha</option>
  <option value="/images/south indian filter coffee.jpg">
    South Indian Filter Coffee
  </option>
  <option value="/images/cold brew.jpg">Cold Brew</option>
  <option value="/images/masala chai.jpg">Masala Chai</option>
  <option value="/images/hot chocolate.jpg">Hot Chocolate</option>
  <option value="/images/green tea.jpg">Green Tea</option>
  <option value="/images/fresh lime soda.jpg">Fresh Lime Soda</option>
  <option value="/images/mango smoothie.jpg">Mango Smoothie</option>
  <option value="/images/veg sandwich.jpg">Veg Sandwich</option>
  <option value="/images/paneer wrap.jpg">Paneer Wrap</option>
  <option value="/images/samosa.jpg">Samosa</option>
  <option value="/images/french fries.jpg">French Fries</option>
  <option value="/images/garlic bread.jpg">Garlic Bread</option>
  <option value="/images/pasta.jpg">Pasta</option>
  <option value="/images/brownie.jpg">Brownie</option>
  <option value="/images/cheesecake.jpg">Cheesecake</option>
</select>

              <button>Add</button>
            </form>
          </div>

          <div className="list">
            {items.map((item) => (
              <div className="card row" key={item.id}>
                <span>
                  <b>{item.name}</b>
                  <small>{item.description}</small>
                  <small>{money(item.price)}</small>
                </span>

                <button onClick={() => toggleItem(item)}>
                  {item.available ? "Mark sold out" : "Make available"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "tables" && (
        <div className="list">
          {tables.map((table) => (
            <div className="card row" key={table.id}>
  <span>
    <b>{table.label}</b>
    <small>Capacity: {table.capacity}</small>

    <small>
      Status:{" "}
      {table.session_status === "open" ? "🔴 Occupied" : "🟢 Free"}
    </small>

    {table.session_status === "open" && (
      <>

        <small>Customer: {table.guest_name}</small>
        <small>Phone: {table.phone}</small>
        <small>
          Since:{" "}
          {table.occupied_since
            ? new Date(table.occupied_since).toLocaleString()
            : "—"}
        </small>
      </>
    )}
  </span>

  <button onClick={() => showQR(table)}>
    Show QR
  </button>
  {table.session_status === "open" && (
  <button onClick={() => releaseTable(table)}>
    Release Table
  </button>
)}
</div>
          ))}
        </div>
      )}
      {tab === "customers" && (
  <div className="card">
    <h2>Customer Activity</h2>

    {customers.length === 0 ? (
      <p>No customer activity yet.</p>
    ) : (
      <div className="customer-list">
        {customers.map((c, i) => (
          <div className="card row" key={i}>
            <div>
              <b>{c.customer_name}</b>
              <p>Phone: {c.phone}</p>
              <p>Table: {c.table_label}</p>
              <p>People: {c.party_size || "—"}</p>
              <p>
                Check-in:{" "}
                {c.checkin_time
                  ? new Date(c.checkin_time).toLocaleString()
                  : "—"}
              </p>
              <p>Status: {c.session_status}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
{tab === "orders" && (
  <div className="card">
    <h2>Order History</h2>
    <div className="order-filters">
  <input
    placeholder="Search customer, phone or table..."
    value={orderSearch}
    onChange={(e) => setOrderSearch(e.target.value)}
  />

  <div className="filters">
    <button onClick={() => setOrderStatus("All")}>All</button>
    <button onClick={() => setOrderStatus("Received")}>Received</button>
    <button onClick={() => setOrderStatus("Preparing")}>Preparing</button>
    <button onClick={() => setOrderStatus("Ready")}>Ready</button>
    <button onClick={() => setOrderStatus("Served")}>Served</button>
    <div className="filters">
  <button onClick={() => setOrderDate("All")}>All Dates</button>
  <button onClick={() => setOrderDate("Today")}>Today</button>
  <button onClick={() => setOrderDate("Week")}>This Week</button>
  <button onClick={() => setOrderDate("Older")}>Older</button>
</div>
  </div>
</div>

    {ownerOrders.length === 0 ? (
      <p>No orders yet.</p>
    ) : (
      <div className="customer-list">
        {ownerOrders
  .filter((o) => {
    const search = orderSearch.toLowerCase().trim();

    const matchesSearch =
      !search ||
      String(o.guest_name || "").toLowerCase().includes(search) ||
      String(o.phone || "").includes(search) ||
      String(o.table_label || "").toLowerCase().includes(search);

    const matchesStatus =
  orderStatus === "All" || o.status === orderStatus;

const orderTime = o.created_at
  ? new Date(o.created_at)
  : null;

const now = new Date();

const startToday = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate()
);

const startWeek = new Date(startToday);
startWeek.setDate(startWeek.getDate() - 6);

const matchesDate =
  orderDate === "All" ||
  (orderTime &&
    orderDate === "Today" &&
    orderTime >= startToday) ||
  (orderTime &&
    orderDate === "Week" &&
    orderTime >= startWeek) ||
  (orderTime &&
    orderDate === "Older" &&
    orderTime < startWeek);

return matchesSearch && matchesStatus && matchesDate;
  })
  .map((o) => (
          <div className="card row" key={o.id}>
            <div>
              <h3>Order #{o.id}</h3>

              <p><b>Customer:</b> {o.guest_name}</p>
              <p><b>Phone:</b> {o.phone}</p>
              <p><b>Table:</b> {o.table_label}</p>
              <p><b>Status:</b> {o.status}</p>
              <p><b>Total:</b> {money(o.total)}</p>

              <p>
                <b>Order time:</b>{" "}
                {o.created_at
                  ? new Date(o.created_at).toLocaleString()
                  : "—"}
              </p>

              <div>
                <b>Items:</b>

                {o.items?.map((item) => (
                  <p key={item.id}>
                    {item.quantity} × {item.name}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

      {tab === "reports" && (
        <div className="grid2">
          <div className="card">
            <h2>Today</h2>
            <h1>{money(report.today?.revenue)}</h1>
            <p>{report.today?.orders || 0} paid orders</p>
          </div>

          <div className="card">
            <h2>All time</h2>
            <h1>{money(report.all?.revenue)}</h1>
            <p>{report.all?.orders || 0} paid orders</p>
          </div>
        </div>
      )}
    </Layout>
  );
}

function App() {
  const path = window.location.pathname;

  if (path === "/staff") {
    return localStorage.getItem("token") &&
      localStorage.getItem("role") === "staff" ? (
      <Staff />
    ) : (
      <Login role="staff" />
    );
  }

  if (path === "/owner") {
    return localStorage.getItem("token") &&
      localStorage.getItem("role") === "owner" ? (
      <Owner />
    ) : (
      <Login role="owner" />
    );
  }

  return <Customer />;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);