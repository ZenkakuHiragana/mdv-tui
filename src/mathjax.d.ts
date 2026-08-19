declare module "mathjax" {
  const MathJax: {
    init(options?: Record<string, unknown>): Promise<unknown>;
  };

  export default MathJax;
}
