(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const P = window.PRODUCTS, SIZES = window.SIZES, SIDES = window.SIDES;
  const fmt = (n) => n.toLocaleString('ru-RU') + ' сум';

  // ---------- корзина ----------
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('kd_cart') || '[]'); } catch (_) {}
  const save = () => { try { localStorage.setItem('kd_cart', JSON.stringify(cart)); } catch (_) {} };

  // ---------- каталог ----------
  const grid = $('#grid');
  function renderGrid(filter = 'all') {
    const list = P.filter((p) => filter === 'all' || (filter === 'nrsht' ? p.id.startsWith('nrsht') : p.id.startsWith('nrt')));
    grid.innerHTML = list.map((p) => `
      <article class="card" data-id="${p.id}">
        <div class="card__img">
          <img src="${p.img}" alt="Межкомнатная дверь ${p.model}" loading="lazy">
          ${p.tag ? `<span class="tag">${p.tag}</span>` : ''}
        </div>
        <div class="card__body">
          <h3>${p.model}</h3>
          <div class="meta">${p.material} · ${p.frame}</div>
          <p class="desc">${p.desc}</p>
          <div class="price">${p.price ? fmt(p.price) : 'Цена по запросу'}</div>
          <div class="row">
            <select class="sz" aria-label="Размер">${SIZES.map((s) => `<option>${s}</option>`).join('')}</select>
            <select class="sd" aria-label="Сторона открывания">${SIDES.map((s) => `<option>${s}</option>`).join('')}</select>
          </div>
          <button class="btn add" type="button">В корзину</button>
        </div>
      </article>`).join('');
  }
  renderGrid();

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
    renderGrid(b.dataset.f);
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.add'); if (!btn) return;
    const card = btn.closest('.card');
    const p = P.find((x) => x.id === card.dataset.id);
    const size = $('.sz', card).value, side = $('.sd', card).value;
    const ex = cart.find((i) => i.id === p.id && i.size === size && i.side === side);
    if (ex) ex.qty++; else cart.push({ id: p.id, size, side, qty: 1 });
    save(); renderCart();
    toast(`${p.model} добавлена в корзину`);
  });

  // ---------- отрисовка корзины ----------
  function renderCart() {
    const n = cart.reduce((s, i) => s + i.qty, 0);
    const badge = $('#cartCount');
    badge.textContent = n; badge.dataset.n = n;
    const box = $('#cartList');
    if (!cart.length) { box.innerHTML = '<p class="empty">Корзина пуста.<br>Выберите двери в каталоге.</p>'; $('#orderForm').style.display = 'none'; return; }
    $('#orderForm').style.display = '';
    box.innerHTML = cart.map((i, idx) => {
      const p = P.find((x) => x.id === i.id);
      return `<div class="item" data-i="${idx}">
        <img src="${p.img}" alt="">
        <div><b>${p.model}</b><small>${i.size} м · ${i.side} · ${p.material}</small>
          <div class="qty"><button type="button" data-a="minus" aria-label="Меньше">−</button><span>${i.qty}</span><button type="button" data-a="plus" aria-label="Больше">+</button></div>
        </div>
        <button class="rm" type="button" data-a="rm" aria-label="Удалить">×</button>
      </div>`;
    }).join('');
  }
  $('#cartList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const idx = +b.closest('.item').dataset.i, a = b.dataset.a, it = cart[idx];
    if (a === 'plus') it.qty = Math.min(it.qty + 1, 99);
    if (a === 'minus') it.qty = Math.max(it.qty - 1, 1);
    if (a === 'rm') cart.splice(idx, 1);
    save(); renderCart();
  });

  // ---------- drawer ----------
  const drawer = $('#drawer'), overlay = $('#overlay');
  const open = () => { drawer.classList.add('on'); overlay.classList.add('on'); drawer.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; };
  const close = () => { drawer.classList.remove('on'); overlay.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
  $('#openCart').onclick = open; $('#closeCart').onclick = close; overlay.onclick = close;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // ---------- отправка заказа ----------
  const form = $('#orderForm'), err = $('#err'), btn = $('#submitBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const f = new FormData(form);
    const name = (f.get('name') || '').trim(), phone = (f.get('phone') || '').trim();
    if (!name) return (err.textContent = 'Укажите имя');
    if (phone.replace(/\D/g, '').length < 9) return (err.textContent = 'Укажите корректный номер телефона');

    const items = cart.map((i) => {
      const p = P.find((x) => x.id === i.id);
      return { model: p.model, size: i.size, side: i.side, material: p.material, qty: i.qty };
    });
    btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const r = await fetch('/api/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, address: f.get('address'), comment: f.get('comment'), website: f.get('website'), items }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || 'Ошибка отправки. Позвоните нам: +998 91 389 79 87');
      cart = []; save(); renderCart(); form.reset(); close();
      $('#done').hidden = false;
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Отправить заявку';
    }
  });
  $('#doneBtn').onclick = () => ($('#done').hidden = true);

  // ---------- мелочи ----------
  let tt;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 1800); }
  $('#year').textContent = new Date().getFullYear();
  renderCart();
})();
