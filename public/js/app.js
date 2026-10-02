// ============================================================
// TECHVERSE GEAR - FRONTEND APPLICATION
// ============================================================

// --- Application State ---
let MOCK_PRODUCTS = [];
let cartState = [];
let mockOrders = [];
let selectedCategory = 'all';
let authUser = null;


// ============================================================
// CURRENCY FORMATTER
// ============================================================

function formatNGN(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount));
}


// ============================================================
// PRODUCT LOADING
// ============================================================

async function loadProducts() {
  try {
    const response = await fetch('/api/products');

    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }

    const products = await response.json();

    MOCK_PRODUCTS = products.map(product => ({
      id: product.id,
      title: product.name,
      category: product.category,
      price: Number(product.price),
      rating: 5.0,
      image: product.image_url,
      description: product.description,
      stock: Number(product.stock)
    }));

    filterProducts();

  } catch (error) {
    console.error(
      'Error loading products:',
      error
    );

    triggerToast(
      'Unable to load products.'
    );
  }
}


// ============================================================
// PAGE INITIALIZATION
// ============================================================

window.onload = async function () {
  initializeAuth();
  // ----------------------------------------------------------
  // 1. Restore cart
  // ----------------------------------------------------------

  const savedCart =
    localStorage.getItem(
      'techverse_cart'
    );

  if (savedCart) {
    try {
      cartState =
        JSON.parse(savedCart);

      if (!Array.isArray(cartState)) {
        cartState = [];
      }

    } catch (error) {
      console.error(
        'Could not restore cart:',
        error
      );

      cartState = [];
    }
  }


  // ----------------------------------------------------------
  // 2. Restore saved checkout email
  // ----------------------------------------------------------

  const savedCheckoutEmail =
    localStorage.getItem(
      'techverse_checkout_email'
    );

  const emailField =
    document.getElementById(
      'ship-email-addr'
    );

  if (
    savedCheckoutEmail &&
    emailField &&
    !emailField.value
  ) {
    emailField.value =
      savedCheckoutEmail;
  }


  // ----------------------------------------------------------
  // 3. Render initial UI
  // ----------------------------------------------------------

  renderAuthBar();

  updateCartDisplay();


  // ----------------------------------------------------------
  // 4. Load products
  // ----------------------------------------------------------

  await loadProducts();


  // ----------------------------------------------------------
  // 5. IMPORTANT:
  //
  // Capture the Paystack reference BEFORE any function
  // modifies the browser URL.
  // ----------------------------------------------------------

  const initialParams =
    new URLSearchParams(
      window.location.search
    );

  const initialPaymentReference =
    initialParams.get('reference') ||
    initialParams.get('trxref');


  // ----------------------------------------------------------
  // 6. Handle Paystack return
  //
  // If a reference exists, handlePaystackReturn()
  // will verify the transaction, clear the cart,
  // load the order and switch to Orders.
  // ----------------------------------------------------------

  let returnedFromPaystack = false;

  if (initialPaymentReference) {

    returnedFromPaystack =
      await handlePaystackReturn(
        initialPaymentReference
      );
  }


  // ----------------------------------------------------------
  // 7. Normal page load
  //
  // If this was NOT a Paystack return, simply load
  // the customer's existing orders.
  //
  // If it WAS a Paystack return, handlePaystackReturn()
  // already loaded the orders.
  // ----------------------------------------------------------

  if (!returnedFromPaystack) {
    await loadOrders();
  }
};


// ============================================================
// THEME SWITCHER
// ============================================================

function toggleTheme() {

  const html =
    document.documentElement;

  const icon =
    document.getElementById(
      'theme-toggle-icon'
    );

  if (!icon) {
    return;
  }

  if (
    html.classList.contains('dark')
  ) {

    html.classList.remove('dark');

    icon.classList.replace(
      'fa-sun',
      'fa-moon'
    );

  } else {

    html.classList.add('dark');

    icon.classList.replace(
      'fa-moon',
      'fa-sun'
    );
  }
}


// ============================================================
// MAIN TAB NAVIGATION
// ============================================================

function switchMainTab(tabId) {

  [
    'store',
    'checkout',
    'orders',
    'hub'
  ].forEach(id => {

    const view =
      document.getElementById(
        `view-${id}`
      );

    if (view) {
      view.classList.add('hidden');
    }
  });


  const activeView =
    document.getElementById(
      `view-${tabId}`
    );

  if (activeView) {
    activeView.classList.remove(
      'hidden'
    );
  }


  // Update navigation button styles

  const storeBtn =
    document.getElementById(
      'nav-btn-store'
    );

  const ordersBtn =
    document.getElementById(
      'nav-btn-orders'
    );

  const hubBtn =
    document.getElementById(
      'nav-btn-hub'
    );


  [
    storeBtn,
    ordersBtn,
    hubBtn
  ].forEach(button => {

    if (button) {

      button.className =
        "px-4 py-2 text-xs font-bold rounded-xl transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-2";
    }
  });


  if (
    tabId === 'store' &&
    storeBtn
  ) {

    storeBtn.className =
      "px-4 py-2 text-xs font-bold rounded-xl transition-all text-sky-600 dark:text-sky-400 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-2";

  } else if (
    tabId === 'orders' &&
    ordersBtn
  ) {

    ordersBtn.className =
      "px-4 py-2 text-xs font-bold rounded-xl transition-all text-sky-600 dark:text-sky-400 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-2";

  } else if (
    tabId === 'hub' &&
    hubBtn
  ) {

    hubBtn.className =
      "px-4 py-2 text-xs font-bold rounded-xl transition-all text-sky-600 dark:text-sky-400 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-2";
  }


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


// ============================================================
// AUTHENTICATION UI
// ============================================================

function renderAuthBar() {

  const container =
    document.getElementById(
      'user-auth-widget'
    );

  if (!container) {
    return;
  }


  if (authUser) {

    container.innerHTML = `
      <div class="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 p-1.5 pr-3 rounded-full border border-slate-200 dark:border-slate-700">

        <img
          src="${authUser.avatar}"
          class="w-6 h-6 rounded-full object-cover"
          alt="${authUser.name}"
        >

        <span class="text-xs font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">
          ${authUser.name}
        </span>

        <button
          onclick="signOutAuth()"
          class="text-slate-400 hover:text-red-500 text-xs ml-1"
        >
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>

      </div>
    `;

  } else {

    container.innerHTML = `
      <button
        onclick="signInWithGoogle()"
        class="flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm"
      >

        <i class="fa-brands fa-google text-red-500"></i>

        <span class="hidden sm:inline">
          Google Login
        </span>

      </button>
    `;
  }
}


async function signInWithGoogle() {
  try {
    const { error } =
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

    if (error) {
      throw error;
    }

  } catch (error) {
    console.error('Google sign-in error:', error);

    triggerToast(
      error.message ||
      'Unable to sign in with Google.'
    );
  }
}


async function signOutAuth() {
  try {
    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }

    authUser = null;

    renderAuthBar();

    triggerToast(
      'Signed out successfully'
    );

  } catch (error) {
    console.error('Google sign-out error:', error);

    triggerToast(
      error.message ||
      'Unable to sign out.'
    );
  }
}

function initializeAuth() {
  supabaseClient.auth.onAuthStateChange(
    (_event, session) => {
      if (session?.user) {
        const user = session.user;

        authUser = {
          name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email ||
            'Google User',

          email: user.email,

          avatar:
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            ''
        };
      } else {
        authUser = null;
      }

      renderAuthBar();
    }
  );
}


// ============================================================
// PRODUCT CATALOG
// ============================================================

function setCategoryFilter(cat) {

  selectedCategory = cat;

  document
    .querySelectorAll('.cat-pill')
    .forEach(button => {

      button.className =
        "cat-pill px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition";
    });


  const activeBtn =
    document.getElementById(
      `cat-btn-${cat}`
    );

  if (activeBtn) {

    activeBtn.className =
      "cat-pill px-3.5 py-1.5 text-xs font-bold rounded-xl bg-sky-600 text-white shadow-sm transition";
  }

  filterProducts();
}


function filterProducts() {

  const grid =
    document.getElementById(
      'catalog-grid'
    );

  if (!grid) {
    return;
  }


  const searchInput =
    document.getElementById(
      'search-bar'
    );

  const sortDropdown =
    document.getElementById(
      'sort-dropdown'
    );


  const search =
    searchInput
      ? searchInput.value.toLowerCase()
      : '';


  const sort =
    sortDropdown
      ? sortDropdown.value
      : '';


  let filtered =
    MOCK_PRODUCTS.filter(product => {

      const matchesCat =
        selectedCategory === 'all' ||
        product.category === selectedCategory;

      const matchesSearch =
        product.title
          .toLowerCase()
          .includes(search) ||

        product.description
          .toLowerCase()
          .includes(search);

      return (
        matchesCat &&
        matchesSearch
      );
    });


  if (sort === 'price-low') {

    filtered.sort(
      (a, b) =>
        a.price - b.price
    );

  } else if (
    sort === 'price-high'
  ) {

    filtered.sort(
      (a, b) =>
        b.price - a.price
    );

  } else if (
    sort === 'rating'
  ) {

    filtered.sort(
      (a, b) =>
        b.rating - a.rating
    );
  }


  grid.innerHTML =
    filtered
      .map(
        product => `
          <div class="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition duration-300 flex flex-col group">

            <div
              class="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-950 cursor-pointer"
              onclick="openProductModal('${product.id}')"
            >

              <img
                src="${product.image}"
                alt="${product.title}"
                class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
              >

              <span class="absolute top-3 right-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">

                <i class="fa-solid fa-star text-amber-400"></i>

                ${product.rating}

              </span>

            </div>


            <div class="p-4 flex flex-col flex-grow space-y-2">

              <span class="text-[10px] font-extrabold uppercase tracking-wider text-sky-500">
                ${product.category}
              </span>

              <h3
                class="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 cursor-pointer hover:text-sky-500"
                onclick="openProductModal('${product.id}')"
              >
                ${product.title}
              </h3>

              <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 flex-grow">
                ${product.description}
              </p>


              <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">

                <span class="text-base font-extrabold text-slate-900 dark:text-white">
                  ${formatNGN(product.price)}
                </span>

                <button
                  onclick="addToCart('${product.id}')"
                  class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-sky-600/20 flex items-center gap-1"
                >

                  <i class="fa-solid fa-cart-plus"></i>

                  Add

                </button>

              </div>

            </div>

          </div>
        `
      )
      .join('');
}


// ============================================================
// PRODUCT MODAL
// ============================================================

function openProductModal(id) {

  const product =
    MOCK_PRODUCTS.find(
      item => item.id === id
    );

  if (!product) {
    return;
  }


  const body =
    document.getElementById(
      'product-modal-body'
    );

  if (!body) {
    return;
  }


  body.innerHTML = `
    <div class="rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 h-56 sm:h-auto">

      <img
        src="${product.image}"
        class="w-full h-full object-cover"
        alt="${product.title}"
      >

    </div>


    <div class="flex flex-col justify-between space-y-3">

      <div>

        <span class="text-[10px] font-extrabold uppercase text-sky-500">
          ${product.category}
        </span>

        <h3 class="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
          ${product.title}
        </h3>

        <div class="flex items-center space-x-2 mt-1.5 text-xs text-amber-400 font-bold">

          <i class="fa-solid fa-star"></i>

          <span>
            ${product.rating} Rating
          </span>

        </div>

        <p class="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
          ${product.description}
        </p>

      </div>


      <div class="pt-2">

        <div class="text-xl font-extrabold text-slate-900 dark:text-white mb-3">
          ${formatNGN(product.price)}
        </div>

        <button
          onclick="addToCart('${product.id}'); closeProductModal();"
          class="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-sky-600/20"
        >
          Add to Shopping Cart
        </button>

      </div>

    </div>
  `;


  const modal =
    document.getElementById(
      'product-modal'
    );

  if (modal) {
    modal.classList.remove(
      'hidden'
    );
  }
}


function closeProductModal() {

  const modal =
    document.getElementById(
      'product-modal'
    );

  if (modal) {
    modal.classList.add(
      'hidden'
    );
  }
}


// ============================================================
// SHOPPING CART
// ============================================================

function toggleCartDrawer() {

  const drawer =
    document.getElementById(
      'cart-drawer-container'
    );

  if (drawer) {
    drawer.classList.toggle(
      'translate-x-full'
    );
  }
}


function addToCart(id) {

  const product =
    MOCK_PRODUCTS.find(
      item => item.id === id
    );

  if (!product) {
    return;
  }


  const existing =
    cartState.find(
      item => item.id === id
    );

  const currentQuantity =
    existing
      ? existing.quantity
      : 0;


  if (
    currentQuantity >= product.stock
  ) {

    triggerToast(
      `Only ${product.stock} units available`
    );

    return;
  }


  if (existing) {

    existing.quantity += 1;

  } else {

    cartState.push({
      ...product,
      quantity: 1
    });
  }


  saveCartState();

  updateCartDisplay();


  triggerToast(
    `Added ${product.title} to cart`
  );
}


function adjustCartQty(
  id,
  delta
) {

  const item =
    cartState.find(
      cartItem => cartItem.id === id
    );

  if (!item) {
    return;
  }


  const product =
    MOCK_PRODUCTS.find(
      productItem => productItem.id === id
    );


  item.quantity += delta;


  if (
    product &&
    item.quantity > product.stock
  ) {

    item.quantity =
      product.stock;

    triggerToast(
      `Only ${product.stock} units available`
    );
  }


  if (
    item.quantity <= 0
  ) {

    cartState =
      cartState.filter(
        cartItem => cartItem.id !== id
      );
  }


  saveCartState();

  updateCartDisplay();
}


function saveCartState() {

  localStorage.setItem(
    'techverse_cart',
    JSON.stringify(cartState)
  );
}


function updateCartDisplay() {

  const container =
    document.getElementById(
      'cart-drawer-items'
    );

  const badge =
    document.getElementById(
      'cart-counter-badge'
    );


  if (!container || !badge) {
    return;
  }


  const totalCount =
    cartState.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    );


  if (totalCount > 0) {

    badge.innerText =
      totalCount;

    badge.classList.remove(
      'hidden'
    );

  } else {

    badge.classList.add(
      'hidden'
    );
  }


  if (
    cartState.length === 0
  ) {

    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 space-y-2">

        <i class="fa-solid fa-basket-shopping text-3xl"></i>

        <p class="text-xs font-bold">
          Your cart is currently empty.
        </p>

      </div>
    `;

  } else {

    container.innerHTML =
      cartState
        .map(
          item => `
            <div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">

              <div class="flex items-center space-x-2.5">

                <img
                  src="${item.image}"
                  class="w-10 h-10 object-cover rounded-lg"
                  alt="${item.title}"
                >

                <div>

                  <h4 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                    ${item.title}
                  </h4>

                  <span class="text-xs font-bold text-sky-500">
                    ${formatNGN(
                      Number(item.price) *
                      Number(item.quantity)
                    )}
                  </span>

                </div>

              </div>


              <div class="flex items-center space-x-2 bg-white dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">

                <button
                  onclick="adjustCartQty('${item.id}', -1)"
                  class="w-4 h-4 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  -
                </button>

                <span class="text-xs font-extrabold w-4 text-center">
                  ${item.quantity}
                </span>

                <button
                  onclick="adjustCartQty('${item.id}', 1)"
                  class="w-4 h-4 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
                >
                  +
                </button>

              </div>

            </div>
          `
        )
        .join('');
  }


  const subtotal =
    cartState.reduce(
      (sum, item) =>
        sum +
        Number(item.price) *
        Number(item.quantity),
      0
    );


  const subtotalElement =
    document.getElementById(
      'cart-drawer-subtotal'
    );

  if (subtotalElement) {
    subtotalElement.innerText =
      formatNGN(subtotal);
  }
}


// ============================================================
// CHECKOUT
// ============================================================

function proceedToCheckoutFlow() {

  if (
    cartState.length === 0
  ) {

    triggerToast(
      'Please add items to your cart first!'
    );

    return;
  }


  toggleCartDrawer();

  renderCheckoutSummary();

  gotoStep(1);

  switchMainTab(
    'checkout'
  );
}


function gotoStep(step) {

  const steps = [
    1,
    2,
    3
  ];


  if (step === 2) {

    if (
      !validateShippingDetails()
    ) {
      return;
    }
  }


  steps.forEach(
    stepNumber => {

      const stepElement =
        document.getElementById(
          `checkout-step-${stepNumber}`
        );

      const indicator =
        document.getElementById(
          `checkout-step-indicator-${stepNumber}`
        );


      if (
        !stepElement ||
        !indicator
      ) {
        return;
      }


      if (
        stepNumber === step
      ) {

        stepElement.classList.remove(
          'hidden'
        );

        indicator.classList.remove(
          'text-slate-400'
        );

        indicator.classList.add(
          'text-sky-600',
          'dark:text-sky-400'
        );

      } else {

        stepElement.classList.add(
          'hidden'
        );

        indicator.classList.remove(
          'text-sky-600',
          'dark:text-sky-400'
        );

        indicator.classList.add(
          'text-slate-400'
        );
      }
    }
  );


  if (
    step === 2 ||
    step === 3
  ) {

    renderCheckoutReview();

    renderCheckoutSummary();
  }


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


// ============================================================
// SHIPPING VALIDATION
// ============================================================

function validateShippingDetails() {

  const fields = [
    'ship-email-addr',
    'ship-first-name',
    'ship-last-name',
    'ship-street',
    'ship-city-name',
    'ship-state-code',
    'ship-zip-code'
  ];


  for (
    const fieldId of fields
  ) {

    const field =
      document.getElementById(
        fieldId
      );


    if (
      !field ||
      !field.value.trim()
    ) {

      triggerToast(
        'Please complete all shipping details.'
      );

      if (field) {
        field.focus();
      }

      return false;
    }
  }


  const email =
    document
      .getElementById(
        'ship-email-addr'
      )
      .value
      .trim();


  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  if (
    !emailPattern.test(email)
  ) {

    triggerToast(
      'Please enter a valid email address.'
    );

    document
      .getElementById(
        'ship-email-addr'
      )
      .focus();

    return false;
  }


  return true;
}


// ============================================================
// CHECKOUT REVIEW
// ============================================================

function renderCheckoutReview() {

  const addressElement =
    document.getElementById(
      'checkout-review-address'
    );

  const itemsElement =
    document.getElementById(
      'checkout-review-items'
    );


  if (
    !addressElement ||
    !itemsElement
  ) {
    return;
  }


  const firstName =
    document
      .getElementById(
        'ship-first-name'
      )
      .value
      .trim();

  const lastName =
    document
      .getElementById(
        'ship-last-name'
      )
      .value
      .trim();

  const street =
    document
      .getElementById(
        'ship-street'
      )
      .value
      .trim();

  const city =
    document
      .getElementById(
        'ship-city-name'
      )
      .value
      .trim();

  const state =
    document
      .getElementById(
        'ship-state-code'
      )
      .value
      .trim();

  const postalCode =
    document
      .getElementById(
        'ship-zip-code'
      )
      .value
      .trim();


  addressElement.textContent =
    `${firstName} ${lastName}, ${street}, ${city}, ${state} ${postalCode}`;


  if (
    cartState.length === 0
  ) {

    itemsElement.innerHTML = `
      <p class="text-slate-400">
        Your cart is empty.
      </p>
    `;

    return;
  }


  itemsElement.innerHTML =
    cartState
      .map(item => {

        const itemTotal =
          Number(item.price) *
          Number(item.quantity);


        return `
          <div class="flex items-center justify-between gap-4">

            <div class="min-w-0">

              <p class="font-bold text-slate-800 dark:text-slate-200 truncate">
                ${item.title}
              </p>

              <p class="text-[10px] text-slate-400">
                Qty: ${item.quantity}
              </p>

            </div>


            <span class="font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              ${formatNGN(itemTotal)}
            </span>

          </div>
        `;
      })
      .join('');
}


// ============================================================
// CHECKOUT SUMMARY
// ============================================================

function renderCheckoutSummary() {

  const container =
    document.getElementById(
      'checkout-summary-items'
    );


  if (!container) {
    return;
  }


  const subtotal =
    cartState.reduce(
      (sum, item) =>
        sum +
        Number(item.price) *
        Number(item.quantity),
      0
    );


  const tax =
    subtotal * 0.085;

  const total =
    subtotal + tax;


  container.innerHTML =
    cartState
      .map(
        item => `
          <div class="flex justify-between text-xs py-1">

            <span class="text-slate-600 dark:text-slate-300 font-medium">
              ${item.title} (x${item.quantity})
            </span>

            <span class="font-bold text-slate-900 dark:text-white">
              ${formatNGN(
                Number(item.price) *
                Number(item.quantity)
              )}
            </span>

          </div>
        `
      )
      .join('');


  const subtotalElement =
    document.getElementById(
      'checkout-summary-subtotal'
    );

  const taxElement =
    document.getElementById(
      'checkout-summary-tax'
    );

  const totalElement =
    document.getElementById(
      'checkout-summary-total'
    );


  if (subtotalElement) {

    subtotalElement.innerText =
      formatNGN(subtotal);
  }


  if (taxElement) {

    taxElement.innerText =
      formatNGN(tax);
  }


  if (totalElement) {

    totalElement.innerText =
      formatNGN(total);
  }
}


// ============================================================
// PAYSTACK CHECKOUT INITIALIZATION
// ============================================================

async function executeOrderSubmission() {

  const btn =
    document.getElementById(
      'paystack-payment-btn'
    );


  if (!btn) {

    console.error(
      'Paystack payment button not found.'
    );

    triggerToast(
      'Payment button could not be found.'
    );

    return;
  }


  if (
    !validateShippingDetails()
  ) {
    return;
  }


  if (
    cartState.length === 0
  ) {

    triggerToast(
      'Your cart is empty.'
    );

    return;
  }


  const email =
    document
      .getElementById(
        'ship-email-addr'
      )
      .value
      .trim();

  const firstName =
    document
      .getElementById(
        'ship-first-name'
      )
      .value
      .trim();

  const lastName =
    document
      .getElementById(
        'ship-last-name'
      )
      .value
      .trim();

  const street =
    document
      .getElementById(
        'ship-street'
      )
      .value
      .trim();

  const city =
    document
      .getElementById(
        'ship-city-name'
      )
      .value
      .trim();

  const state =
    document
      .getElementById(
        'ship-state-code'
      )
      .value
      .trim();

  const postalCode =
    document
      .getElementById(
        'ship-zip-code'
      )
      .value
      .trim();


  // Save email before leaving for Paystack.

  localStorage.setItem(
    'techverse_checkout_email',
    email
  );


  const originalButtonHTML =
    btn.innerHTML;


  btn.disabled = true;

  btn.innerHTML = `
    <i class="fa-solid fa-spinner animate-spin"></i>
    Connecting to Paystack...
  `;


  try {

    const response =
      await fetch(
        '/api/payments/initialize',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              email,
              firstName,
              lastName,
              street,
              city,
              state,
              postalCode,

              items:
                cartState.map(
                  item => ({
                    id: item.id,
                    quantity:
                      item.quantity
                  })
                )
            })
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result.error ||
        'Failed to initialize payment'
      );
    }


    if (
      !result.payment ||
      !result.payment.authorizationUrl
    ) {

      throw new Error(
        'Paystack did not return a checkout URL.'
      );
    }


    triggerToast(
      'Redirecting to Paystack...'
    );


    /*
      IMPORTANT:

      Do NOT clear the cart here.

      Payment has only been initialized.

      The cart is cleared only after our backend
      verifies the transaction and successfully
      creates the order.
    */

    window.location.href =
      result.payment.authorizationUrl;


  } catch (error) {

    console.error(
      'Paystack checkout error:',
      error
    );


    triggerToast(
      error.message ||
      'Failed to initialize payment.'
    );


    btn.disabled = false;

    btn.innerHTML =
      originalButtonHTML;
  }
}


// ============================================================
// PAYSTACK RETURN / PAYMENT VERIFICATION
// ============================================================

async function handlePaystackReturn(
  providedReference = null
) {

  const params =
    new URLSearchParams(
      window.location.search
    );


  /*
    Paystack normally returns:
      ?reference=TVG-...

    trxref is also supported as a fallback.
  */

  const reference =
    providedReference ||
    params.get('reference') ||
    params.get('trxref');


  // No Paystack reference means normal page load.

  if (!reference) {
    return false;
  }


  console.log(
    'Paystack return detected:',
    reference
  );


  /*
    Prevent duplicate processing during repeated
    page loads in the same browser session.

    IMPORTANT:
    We still load order history after this check.
  */

  const processedReference =
    sessionStorage.getItem(
      'techverse_processed_payment'
    );


  if (
    processedReference === reference
  ) {

    console.log(
      'Payment reference already processed:',
      reference
    );


    cleanPaymentUrl();

    /*
      The payment was already successfully
      processed earlier. Reload the customer's
      orders so the order remains visible.
    */

    await loadOrders();


    switchMainTab(
      'orders'
    );


    triggerToast(
      'Your payment has already been processed.'
    );


    return true;
  }


  triggerToast(
    'Verifying your payment...'
  );


  /*
    Show checkout while verification is happening.
  */

  switchMainTab(
    'checkout'
  );


  try {

    const response =
      await fetch(
        `/api/payments/verify?reference=${encodeURIComponent(reference)}`
      );


    let result;

    try {

      result =
        await response.json();

    } catch (jsonError) {

      throw new Error(
        'The server returned an invalid payment verification response.'
      );
    }


    console.log(
      'Payment verification result:',
      result
    );


    if (!response.ok) {

      throw new Error(
        result.error ||
        'Payment verification failed.'
      );
    }


    /*
      At this point the backend has confirmed
      the payment and finalized the order.

      Backend responsibilities include:

      1. Paystack transaction verification
      2. Currency verification
      3. Amount verification
      4. Payment intent finalization
      5. Order creation
      6. Order item creation
      7. Stock deduction
    */


    sessionStorage.setItem(
      'techverse_processed_payment',
      reference
    );


    /*
      Clear cart ONLY after successful
      backend verification.
    */

    cartState = [];

    saveCartState();

    updateCartDisplay();


    /*
      Restore the customer's saved email
      before loading orders.
    */

    const savedEmail =
      localStorage.getItem(
        'techverse_checkout_email'
      );


    const emailField =
      document.getElementById(
        'ship-email-addr'
      );


    if (
      savedEmail &&
      emailField
    ) {

      emailField.value =
        savedEmail;
    }


    /*
      Clean the Paystack reference from the URL.
    */

    cleanPaymentUrl();


    /*
      IMPORTANT:
      Reload orders AFTER the backend has created
      the order.
    */

    await loadOrders();


    /*
      Move directly to the Orders tab.
    */

    switchMainTab(
      'orders'
    );


    triggerToast(
      'Payment successful! Your order has been created.'
    );


    return true;


  } catch (error) {

    console.error(
      'Paystack return verification error:',
      error
    );


    /*
      DO NOT clear the cart when verification fails.
    */

    triggerToast(
      error.message ||
      'We could not verify your payment.'
    );


    /*
      Remove the reference so a page refresh does
      not repeatedly attempt the same failed
      verification.
    */

    cleanPaymentUrl();


    return false;
  }
}


// ============================================================
// CLEAN PAYSTACK REFERENCE FROM URL
// ============================================================

function cleanPaymentUrl() {

  const cleanUrl =
    window.location.pathname;


  window.history.replaceState(
    {},
    document.title,
    cleanUrl
  );
}


// ============================================================
// LOAD ORDER HISTORY
// ============================================================

async function loadOrders() {

  /*
    First try the checkout email field.
  */

  const emailInput =
    document.getElementById(
      'ship-email-addr'
    );


  let email =
    emailInput
      ? emailInput.value.trim()
      : '';


  /*
    If the checkout field is empty, use the
    email saved before Paystack redirect.
  */

  if (!email) {

    email =
      localStorage.getItem(
        'techverse_checkout_email'
      ) || '';
  }


  /*
    There is no email to query with.
  */

  if (!email) {

    console.log(
      'No customer email available. Orders not loaded.'
    );

    return;
  }


  try {

    console.log(
      'Loading orders for:',
      email
    );


    const response =
      await fetch(
        `/api/orders?email=${encodeURIComponent(email)}`
      );


    let orders;

    try {

      orders =
        await response.json();

    } catch (jsonError) {

      throw new Error(
        'The server returned an invalid orders response.'
      );
    }


    if (!response.ok) {

      throw new Error(
        orders.error ||
        'Failed to load orders'
      );
    }


    /*
      The backend returns:

      {
        id,
        email,
        total,
        status,
        date,
        shippingAddress,
        paymentMethod,
        items
      }
    */

    if (!Array.isArray(orders)) {

      throw new Error(
        'Invalid order history format.'
      );
    }


    mockOrders =
      orders.map(
        order => ({
          orderId: order.id,
          date: order.date,
          email: order.email,
          total: Number(order.total),
          status: order.status,
          paymentMethod:
            order.paymentMethod,
          shippingAddress:
            order.shippingAddress,
          items:
            Array.isArray(order.items)
              ? order.items
              : []
        })
      );


    console.log(
      'Orders loaded:',
      mockOrders
    );


    renderOrdersHistory();


  } catch (error) {

    console.error(
      'Order history error:',
      error
    );


    triggerToast(
      'Failed to load order history.'
    );
  }
}


// ============================================================
// ORDER HISTORY RENDERING
// ============================================================

function renderOrdersHistory() {

  const container =
    document.getElementById(
      'orders-history-list'
    );


  if (!container) {

    console.warn(
      'orders-history-list element not found.'
    );

    return;
  }


  if (
    mockOrders.length === 0
  ) {

    container.innerHTML = `
      <div class="text-center py-12 text-slate-400">

        <i class="fa-solid fa-box-open text-3xl mb-3"></i>

        <p class="text-xs font-bold">
          No orders found.
        </p>

      </div>
    `;

    return;
  }


  container.innerHTML =
    mockOrders
      .map(
        order => `

          <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">

            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-xs">

              <div>

                <span class="font-extrabold text-slate-900 dark:text-white text-sm">
                  ${order.orderId}
                </span>

                <span class="text-slate-400 block">
                  ${order.date} • Sent to ${order.email}
                </span>

                ${
                  order.paymentMethod
                    ? `
                      <span class="text-slate-400 block mt-1">
                        Payment: ${order.paymentMethod}
                      </span>
                    `
                    : ''
                }

              </div>


              <span class="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">

                <i class="fa-solid fa-circle-check mr-1"></i>

                ${order.status}

              </span>

            </div>


            <div class="space-y-2">

              ${
                order.items.length > 0
                  ? order.items
                      .map(
                        item => `
                          <div class="flex justify-between text-xs gap-4">

                            <span class="text-slate-600 dark:text-slate-300 font-medium">
                              ${item.title} (x${item.quantity})
                            </span>

                            <span class="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              ${formatNGN(
                                Number(item.price) *
                                Number(item.quantity)
                              )}
                            </span>

                          </div>
                        `
                      )
                      .join('')
                  : `
                    <p class="text-xs text-slate-400">
                      No items found for this order.
                    </p>
                  `
              }

            </div>


            <div class="border-t border-slate-100 dark:border-slate-800 pt-3 flex justify-between items-center text-xs">

              <span class="font-bold text-slate-500">
                Total Paid
              </span>

              <span class="text-base font-extrabold text-sky-600 dark:text-sky-400">
                ${formatNGN(order.total)}
              </span>

            </div>

          </div>
        `
      )
      .join('');
}


// ============================================================
// INTEGRATION HUB
// ============================================================

function switchHubSection(
  section
) {

  [
    'sql',
    'mailgun',
    'oauth'
  ].forEach(s => {

    const sectionElement =
      document.getElementById(
        `hub-sec-${s}`
      );

    const tabButton =
      document.getElementById(
        `hub-tab-btn-${s}`
      );


    if (sectionElement) {

      sectionElement.classList.add(
        'hidden'
      );
    }


    if (tabButton) {

      tabButton.className =
        "hub-tab-btn py-3 px-4 font-bold text-xs sm:text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 flex items-center gap-2 whitespace-nowrap";
    }
  });


  const activeSection =
    document.getElementById(
      `hub-sec-${section}`
    );

  const activeTab =
    document.getElementById(
      `hub-tab-btn-${section}`
    );


  if (activeSection) {

    activeSection.classList.remove(
      'hidden'
    );
  }


  if (activeTab) {

    activeTab.className =
      "hub-tab-btn py-3 px-4 font-bold text-xs sm:text-sm border-b-2 border-sky-500 text-sky-600 dark:text-sky-400 flex items-center gap-2 whitespace-nowrap";
  }
}


// ============================================================
// TOAST
// ============================================================

function triggerToast(
  message
) {

  const toast =
    document.getElementById(
      'toast-notification'
    );

  const toastMessage =
    document.getElementById(
      'toast-msg'
    );


  if (
    !toast ||
    !toastMessage
  ) {
    return;
  }


  toastMessage.innerText =
    message;


  toast.classList.remove(
    'hidden'
  );


  setTimeout(() => {

    toast.classList.add(
      'hidden'
    );

  }, 3000);
}


// ============================================================
// COPY TO CLIPBOARD
// ============================================================

function copyToClipboard(
  elementId
) {

  const element =
    document.getElementById(
      elementId
    );


  if (!element) {
    return;
  }


  const text =
    element.innerText;


  const el =
    document.createElement(
      'textarea'
    );


  el.value = text;

  document.body.appendChild(el);

  el.select();

  document.execCommand(
    'copy'
  );

  document.body.removeChild(el);


  triggerToast(
    'Code snippet copied to clipboard!'
  );
}