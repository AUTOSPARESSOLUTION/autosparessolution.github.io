const productData = [
  {
    partNo: "SFL1001",
    name: "Wheel Cylinder",
    price: 250,
    stock: 10,
    image: "images/SFL1001.jpg"
  },
  {
    partNo: "SFL1002",
    name: "Brake Pad",
    price: 450,
    stock: 0,
    image: "images/SFL1002.jpg"
  }
  // Add more products as per Excel/CSV
];

const productContainer = document.getElementById("product-container");
const searchBox = document.getElementById("search");

function displayProducts(products) {
  productContainer.innerHTML = '';
  products.forEach(p => {
    const product = document.createElement("div");
    product.className = "product";
    product.innerHTML = `
      <img src="${p.image}" alt="${p.name}" />
      <h3>${p.name}</h3>
      <p>Part No: ${p.partNo}</p>
      <p>Price: ₹${p.price}</p>
      <p class="${p.stock > 0 ? 'stock' : 'out-of-stock'}">
        ${p.stock > 0 ? `In Stock: ${p.stock}` : "Out of Stock"}
      </p>
      ${p.stock > 0 ? `<button class="buy" onclick="buyNow('${p.partNo}', ${p.price})">Buy Now</button>` : ""}
    `;
    productContainer.appendChild(product);
  });
}

function buyNow(partNo, price) {
  const options = {
    key: "Qw92AAq4z7AABJ",
    amount: price * 100,
    currency: "INR",
    name: "Auto Spares Solution",
    description: "Order for " + partNo,
    handler: function (response) {
      alert("Payment Successful. Razorpay ID: " + response.razorpay_payment_id);
    },
    prefill: {
      name: "",
      email: "",
      contact: ""
    }
  };
  const rzp = new Razorpay(options);
  rzp.open();
}

searchBox.addEventListener("input", () => {
  const searchTerm = searchBox.value.toLowerCase();
  const filtered = productData.filter(p => p.partNo.toLowerCase().includes(searchTerm));
  displayProducts(filtered);
});

displayProducts(productData);
