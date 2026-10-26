"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  Plug,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Terminal,
  X,
} from "lucide-react";
import {
  api,
  human,
  setWorkspace,
  type AuditEvent,
  type Me,
  type Order,
  type Product,
  type PurchaseRequest,
  type Room,
  type Workspace,
} from "@/lib/api";
import { Brand } from "./brand";
import { Connections } from "./connections";
import { OrderDetail, ProductDetail, RequestDetail } from "./details";
import { LoginPage } from "./login-page";
import { RoomDetail } from "./room-detail";
import {
  ActivityView,
  NegotiationsView,
  OrdersView,
  ProductsView,
  RequestsView,
} from "./views/lists";
import { OverviewView } from "./views/overview";
import { RulesView } from "./views/rules";
import type { View } from "./views/types";

const titles: Record<View, string> = {
  overview: "Your commerce, in view.",
  products: "The product catalogue.",
  requests: "Every purchase starts here.",
  negotiations: "A place to find agreement.",
  approvals: "The final decision is yours.",
  orders: "Agreed. Approved. Recorded.",
  activity: "Every action, accounted for.",
  rules: "Your limits, privately enforced.",
  connections: "Your agents, connected.",
};
const subtitles: Record<View, string> = {
  overview: "Follow your agents’ work and step in when it matters.",
  products: "Explore the products and evidence behind each offer.",
  requests: "Requirements, supplier matches and the progress of each purchase.",
  negotiations: "Follow offers, counteroffers and the terms taking shape.",
  approvals:
    "Review the exact terms. Both businesses approve before an order is confirmed.",
  orders: "A lasting record of each deal and the people who approved it.",
  activity: "A shared timeline of the actions recorded in your workspace.",
  rules: "The private commercial limits every agent offer is checked against.",
  connections: "Create agent credentials and connect any MCP client.",
};
const icons = {
  overview: LayoutDashboard,
  products: Package,
  requests: ClipboardList,
  negotiations: ArrowLeftRight,
  approvals: ShieldCheck,
  orders: ShoppingBag,
  activity: Activity,
  rules: Lock,
  connections: Plug,
};

/** Keep a newer copy of a room; never let a slow response roll it back. */
const newer = (current: Room | null, updated: Room) =>
  current?.id === updated.id && current.version <= updated.version
    ? updated
    : current;

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null),
    [booting, setBooting] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("overview"),
    [navOpen, setNavOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [requests, setRequests] = useState<PurchaseRequest[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null),
    [selectedRoom, setSelectedRoom] = useState<Room | null>(null),
    [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(
      null,
    ),
    [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null),
    [syncFailed, setSyncFailed] = useState(false);
  // Responses for a workspace the user has since left, or superseded loads, are dropped.
  const workspaceRef = useRef<string | null>(null);
  const selectedRoomRef = useRef<Room | null>(null);
  const loadSequence = useRef(0);
  selectedRoomRef.current = selectedRoom;

  const load = useCallback(async (identity: Me) => {
    const sequence = ++loadSequence.current;
    const roomId = selectedRoomRef.current?.id;
    const current = () =>
      workspaceRef.current === identity.workspace.id &&
      sequence === loadSequence.current;
    const [ps, ns, os, es, rs, detail] = await Promise.all([
      api.products(),
      api.rooms(),
      api.orders(),
      api.activity(),
      identity.workspace.role === "buyer"
        ? api.requests()
        : Promise.resolve([]),
      roomId ? api.room(roomId) : Promise.resolve(null),
    ]).catch((cause: unknown) => {
      if (current()) setSyncFailed(true);
      throw cause;
    });
    if (!current()) return;
    setProducts(ps);
    setRooms(ns);
    setOrders(os);
    setEvents(es);
    setRequests(rs);
    setLastSynced(new Date());
    setSyncFailed(false);
    if (detail) setSelectedRoom((room) => newer(room, detail));
  }, []);

  const clearSnapshot = useCallback(() => {
    ++loadSequence.current;
    setProducts([]);
    setRooms([]);
    setOrders([]);
    setEvents([]);
    setRequests([]);
    setSelectedRoom(null);
    setSelectedProduct(null);
    setSelectedRequest(null);
    setSelectedOrder(null);
    setNotice("");
    setError("");
    setLastSynced(null);
    setSyncFailed(false);
  }, []);

  const initialize = useCallback(async () => {
    try {
      let identity: Me;
      try {
        identity = await api.me();
      } catch {
        localStorage.removeItem("market_workspace");
        identity = await api.me();
      }
      setWorkspace(identity.workspace.id);
      workspaceRef.current = identity.workspace.id;
      setMe(identity);
      setWorkspaces(await api.workspaces());
      await load(identity);
      const params = new URLSearchParams(location.search);
      const initial = params.get("view");
      if (initial && initial in titles) setView(initial as View);
      if (params.get("room"))
        setSelectedRoom(await api.room(params.get("room")!));
    } catch {
      setMe(null);
    } finally {
      setBooting(false);
    }
  }, [load]);

  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (!me) return;
    // load owns sync status; transient polling errors must not overwrite a user's action error.
    const id = setInterval(() => void load(me).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [me, load]);

  async function signIn(email: string, password: string) {
    setBusy(true);
    setError("");
    try {
      localStorage.removeItem("market_workspace");
      await api.signIn(email, password);
      await initialize();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    workspaceRef.current = null;
    try {
      await api.signOut();
    } finally {
      clearSnapshot();
      setMe(null);
      setWorkspaces([]);
      setBusy(false);
      localStorage.removeItem("market_workspace");
    }
  }
  async function switchWorkspace(id: string) {
    workspaceRef.current = id;
    setWorkspace(id);
    clearSnapshot();
    const identity = await api.me();
    if (workspaceRef.current !== id) return;
    setMe(identity);
    await load(identity);
  }
  function navigate(next: View) {
    setView(next);
    setNavOpen(false);
    setNotice("");
    setError("");
    history.replaceState(null, "", `/?view=${next}`);
  }
  function updateProduct(updated: Product) {
    setSelectedProduct(updated);
    setProducts((all) => all.map((p) => (p.id === updated.id ? updated : p)));
    setNotice(`Stock for ${updated.name} is now ${updated.stock}.`);
  }

  if (booting)
    return (
      <div className="loading-screen">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!me) return <LoginPage error={error} busy={busy} onSignIn={signIn} />;

  const pending = rooms.filter((r) => r.state === "awaiting_approval");
  const openRoom = (room: Room) => setSelectedRoom(room);
  const refreshAll = () => load(me);
  return (
    <div className="app-shell">
      <aside className={navOpen ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <Brand />
        </a>
        <div className="workspace-select">
          <span className="avatar">{me.workspace.name.slice(0, 1)}</span>
          <div>
            <select
              aria-label="Workspace"
              value={me.workspace.id}
              onChange={(e) =>
                void switchWorkspace(e.target.value).catch((e) =>
                  setError(e.message),
                )
              }
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <span>{me.workspace.role} workspace</span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav id="workspace-navigation">
          {(Object.keys(titles) as View[])
            .filter((v) => v !== "requests" || me.workspace.role === "buyer")
            .map((v) => {
              const Icon = icons[v];
              return (
                <button
                  className={view === v ? "active" : ""}
                  aria-current={view === v ? "page" : undefined}
                  key={v}
                  onClick={() => navigate(v)}
                >
                  <Icon size={19} />
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                  {v === "approvals" && pending.length > 0 && (
                    <b>{pending.length}</b>
                  )}
                </button>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-card">
            <div>
              <Terminal size={18} />
              <strong>Your agent workflow</strong>
            </div>
            <p>Connect an MCP client and follow your agents’ work here.</p>
            <button
              type="button"
              className="text-button"
              onClick={() => navigate("connections")}
            >
              Manage connections <ArrowRight size={14} />
            </button>
          </div>
          <button className="profile" onClick={() => void signOut()}>
            <span className="avatar small">
              {me.user.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <span>
              <strong>{me.user.name}</strong>
              <small>Sign out</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {navOpen && (
        <button
          aria-label="Close navigation"
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="workspace-navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <span className="desktop-workspace-label">Workspace</span>
            <span className="mobile-workspace-brand">
              <img
                src="/brand/neopact-mark-ink.svg"
                width={32}
                height={32}
                alt="neopact"
              />
            </span>
            <ChevronRight size={14} />
            <strong>{human(view)}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`live-pill${syncFailed ? " sync-stale" : ""}`}
              role="status"
            >
              <span className="live-dot" />{" "}
              {syncFailed
                ? "Sync paused · showing last snapshot"
                : lastSynced
                  ? `Updated ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Loading workspace…"}
            </span>
            <span className="avatar small">{me.user.name[0]}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <h1>{titles[view]}</h1>
              <p>{subtitles[view]}</p>
            </div>
            <button
              className="button quiet"
              aria-label="Refresh"
              onClick={() => void refreshAll().catch(() => {})}
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span className="refresh-label">Refresh</span>
            </button>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <CheckCheck size={18} />
              {notice}
            </div>
          )}
          {view === "overview" && (
            <OverviewView
              me={me}
              rooms={rooms}
              orders={orders}
              products={products}
              events={events}
              navigate={navigate}
              onOpenRoom={openRoom}
              onOpenProduct={setSelectedProduct}
            />
          )}
          {view === "products" && (
            <ProductsView products={products} onOpen={setSelectedProduct} />
          )}
          {view === "requests" && (
            <RequestsView requests={requests} onOpen={setSelectedRequest} />
          )}
          {(view === "negotiations" || view === "approvals") && (
            <NegotiationsView
              key={view}
              rooms={rooms}
              approvalsOnly={view === "approvals"}
              onOpen={openRoom}
            />
          )}
          {view === "orders" && (
            <OrdersView me={me} orders={orders} onOpen={setSelectedOrder} />
          )}
          {view === "activity" && <ActivityView events={events} />}
          {view === "rules" && (
            <RulesView key={me.workspace.id} me={me} products={products} />
          )}
          {view === "connections" && (
            <Connections key={me.workspace.id} workspace={me.workspace} />
          )}
          <footer className="page-footer">
            <span>neopact / terms aligned. business moving.</span>
            <span>Local marketplace · EUR · Demo orders</span>
          </footer>
        </main>
      </div>
      {selectedProduct && (
        <ProductDetail
          me={me}
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onUpdated={updateProduct}
        />
      )}
      {selectedRequest && (
        <RequestDetail
          request={selectedRequest}
          rooms={rooms}
          onClose={() => setSelectedRequest(null)}
          onOpenRoom={openRoom}
        />
      )}
      {selectedRoom && (
        <RoomDetail
          key={`${me.workspace.id}:${selectedRoom.id}`}
          me={me}
          room={selectedRoom}
          syncFailed={syncFailed}
          onClose={() => setSelectedRoom(null)}
          onRoom={(updated) => setSelectedRoom((room) => newer(room, updated))}
          onChanged={refreshAll}
          onNotice={setNotice}
        />
      )}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
