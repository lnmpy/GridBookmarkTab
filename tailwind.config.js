const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  // content: isProduction ? ["./src/**/*.{html,ts}"] : [],
  content: ["./src/index.html"],
  safelist: [],
};
