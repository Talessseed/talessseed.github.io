// main.js
window.addEventListener('DOMContentLoaded', () => {
  const spacing = 10;

  const svgGroup = document.getElementById('dots-layer');
  let allDots = [];

  const createPointsFromGrid = grid =>
    grid.flatMap((row, y) => [...row].map((ch, x) => ch === '1' ? [x * spacing + spacing / 2, y * spacing + spacing / 2] : null).filter(Boolean));


  const shapes = {
    home: createPointsFromGrid([
        "0000000000000000",
        "0000000110000000",
        "0000001001000000",
        "0000010000100000",
        "0000100000010000",
        "0001000000001000",
        "0001111111111000",
        "0001000000001000",
        "0001000000001000",
        "0001000000001000",
        "0001000000001000",
        "0001001111001000",
        "0001001001001000",
        "0001001001001000",
        "0001111001111000",
        "0000000000000000"
    ]),
    pub: createPointsFromGrid([
        "0000000000000000",
        "0001111111000000",
        "0001000000100000",
        "0001011110010000",
        "0001000000001000",
        "0001011101001000",
        "0001000000001000",
        "0001011111001000",
        "0001010001001000",
        "0001001000001000",
        "0001001000001000",
        "0001010001001000",
        "0001011111001000",
        "0001000000001000",
        "0001111111111000",
        "0000000000000000"
    ]),
    talks: createPointsFromGrid([
        "0000000000000000",
        "0000000000000000",
        "0000000000000000",
        "0001110011111110",
        "0001110010000010",
        "0001110010000010",
        "0000100111000010",
        "0011111110000010",
        "0011111011111110",
        "0011110000000000",
        "0011110000000000",
        "0001110000000000",
        "0001010000000000",
        "0001010000000000",
        "0001010000000000",
        "0000000000000000"
    ]),
    teach: createPointsFromGrid([
        "0000000000000000",
        "0001111111111000",
        "0001000000001000",
        "0001000001001000",
        "0001000011101000",
        "0001000001001000",
        "0001001100001000",
        "0001010010001000",
        "0001010010001000",
        "0001011110001000",
        "0001010010001000",
        "0001010010001000",
        "0001010010001000",
        "0001000000001000",
        "0001111111111000",
        "0000000000000000"
    ]),
    cv: createPointsFromGrid([
        "0000000000000000",
        "0000001111000000",
        "0000111001110000",
        "0011100000011100",
        "0010111001110000",
        "0010010110100000",
        "0010010000100000",
        "0111010000100000",
        "0111010000100000",
        "0000001111000000",
        "0000111001110000",
        "0001100000011000",
        "0011000000001100",
        "0010000000000100",
        "0011111111111100",
        "0000000000000000"
    ])
  };

  const size = shapes.home.length;

  function setup(points) {
    svgGroup.innerHTML = '';
    allDots = points.map(([x, y]) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${x},${y})`);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '3');
      g.appendChild(circle);
      svgGroup.appendChild(g);
      return g;
    });
  }

  function animateTo(targetPoints) {
    const sourceCount = allDots.length, targetCount = targetPoints.length;
    let workingDots = allDots.slice();

    if (targetCount > sourceCount) {
      const extra = targetCount - sourceCount;
      for (let i = 0; i < extra; i++) {
        const clone = workingDots[i % sourceCount].cloneNode(true);
        svgGroup.appendChild(clone);
        workingDots.push(clone);
      }
    }

    const maxLength = Math.max(workingDots.length, targetCount);
    const extendedTargets = Array.from({ length: maxLength }, (_, i) => targetPoints[i % targetCount]);

    const costMatrix = workingDots.map(dot => {
      const [x0, y0] = dot.getAttribute('transform').match(/([-\d.]+)/g).map(Number);
      return extendedTargets.map(([x1, y1]) => Math.hypot(x1 - x0, y1 - y0));
    });

    const assignments = new Munkres().compute(costMatrix);

    svgGroup.getBoundingClientRect(); // trigger reflow for animation

    assignments.forEach(([i, j]) => {
      const [tx, ty] = extendedTargets[j];
      workingDots[i].setAttribute('transform', `translate(${tx},${ty})`);
    });

    setTimeout(() => { allDots = workingDots.slice(); }, 600);
  }

  document.querySelectorAll('.header-menu div').forEach(el => {
    el.addEventListener('mouseover', () => {
      const key = el.dataset.shape;
      if (shapes[key]) animateTo(shapes[key]);
    });
  });

  setup(shapes.home);
});
