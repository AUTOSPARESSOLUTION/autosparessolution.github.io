## Hi there 👋

<!--
**AUTOSPARESSOLUTION/AUTOSPARESSOLUTION** is a ✨ _special_ ✨ repository because its `README.md` (this file) appears on your GitHub profile.

Here are some ideas to get you started:

- 🔭 I’m currently working on ...
- 🌱 I’m currently learning ...
- 👯 I’m looking to collaborate on ...
- 🤔 I’m looking for help with ...
- 💬 Ask me about ...
- 📫 How to reach me: ...
- 😄 Pronouns: ...
- ⚡ Fun fact: ...
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Auto Spare Solution - Shop Now</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f2f2f2; }
    header {
      background: #232f3e;
      color: white;
      padding: 15px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 { margin: 0; font-size: 20px; }
    nav input {
      padding: 8px;
      border-radius: 4px;
      border: none;
      width: 200px;
    }
    .container {
      padding: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
    }
    .card {
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    .card h3 {
      font-size: 18px;
      margin: 10px 0 5px;
    }
    .price {
      font-size: 14px;
      color: #888;
    }
    .offer {
      color: green;
      font-size: 16px;
      margin-bottom: 10px;
    }
    .btn {
      background: #ff9900;
      color: white;
      padding: 8px 12px;
      text-decoration: none;
      border-radius: 4px;
      display: inline-block;
    }
    footer {
      background: #232f3e;
      color: white;
      text-align: center;
      padding: 10px;
      margin-top: 30px;
    }
  </style>
</head>
<body>

<header>
  <h1>Auto Spare Solution</h1>
  <nav>
    <input type="text" placeholder="Search part no..." onkeyup="searchProducts(this.value)">
  </nav>
</header>

<div class="container" id="productGrid">
  <!-- Product Cards -->
</div>

<footer>
  <p>&copy; 2025 Auto Spare Solution | GST: 19ANOPD3300R1ZO</p>
</footer>

<script>
  const products = [
    {
      part: "A22479020-0200",
      desc: "Bolt & Nut Assy",
      mrp: 168.45,
      offer: 133.18
    },
    {
      part: "A25879020-0200",
      desc: "Washer Flat",
      mrp: 149.95,
      offer: 118.55
    },
    {
      part: "M15970-0200",
      desc: "Spring Pin",
      mrp: 105.55,
      offer: 83.45
    }
  ];

  function renderProducts(list) {
    const container = document.getElementById("productGrid");
    container.innerHTML = "";
    list.forEach(p => {
      container.innerHTML += `
        <div class="card">
          <h3>${p.part}</h3>
          <p>${p.desc}</p>
          <p class="price">MRP: ₹${p.mrp}</p>
          <p class="offer">Offer: ₹${p.offer}</p>
          <a class="btn" href="https://wa.me/919830300193?text=I want to order ${p.part}" target="_blank">Order Now</a>
        </div>
      `;
    });
  }

  function searchProducts(term) {
    const filtered = products.filter(p => p.part.toLowerCase().includes(term.toLowerCase()));
    renderProducts(filtered);
  }

  renderProducts(products);
</script>

</body>
</html>
