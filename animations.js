window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a').forEach(anchor => {
    anchor.dataset.content = anchor.textContent;
  });

  const navMenu = document.querySelector('.nav-menu');
  if (navMenu) {
    const navLinks = [...navMenu.querySelectorAll('div[data-shape] > a')];
    const currentLink = navMenu.querySelector('a[aria-current="page"]');

    if (navLinks.length > 0 && currentLink) {
      const indicator = document.createElement('span');
      indicator.className = 'nav-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      navMenu.appendChild(indicator);

      let indicatorLink = currentLink;
      let hoveredLink = null;
      let focusedLink = null;
      let resizeFrame = null;

      const positionIndicator = link => {
        if (!link?.isConnected) return;

        indicatorLink = link;
        const navBounds = navMenu.getBoundingClientRect();
        const linkBounds = link.getBoundingClientRect();
        const x = linkBounds.left - navBounds.left;
        const y = linkBounds.bottom - navBounds.top - 2;

        indicator.style.width = `${linkBounds.width}px`;
        indicator.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        indicator.classList.toggle('is-preview', link !== currentLink);
      };

      positionIndicator(currentLink);
      window.requestAnimationFrame(() => {
        navMenu.classList.add('has-moving-indicator');
        indicator.classList.add('is-ready');
      });

      navLinks.forEach(link => {
        link.addEventListener('pointerenter', () => {
          hoveredLink = link;
          positionIndicator(link);
        });
        link.addEventListener('focus', () => {
          focusedLink = link;
          positionIndicator(link);
        });
        link.addEventListener('blur', () => {
          if (focusedLink === link) focusedLink = null;
          positionIndicator(hoveredLink || currentLink);
        });
      });

      navMenu.addEventListener('pointerleave', () => {
        hoveredLink = null;
        positionIndicator(focusedLink || currentLink);
      });

      const repositionIndicator = () => {
        if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = null;
          indicator.classList.add('is-repositioning');
          positionIndicator(indicatorLink);
          window.requestAnimationFrame(() => {
            indicator.classList.remove('is-repositioning');
          });
        });
      };

      if ('ResizeObserver' in window) {
        const navResizeObserver = new ResizeObserver(repositionIndicator);
        navResizeObserver.observe(navMenu);
        navLinks.forEach(link => navResizeObserver.observe(link));
      } else {
        window.addEventListener('resize', repositionIndicator);
      }
    }
  }

  const spacing = 10;
  const radius = 3;
  const size = 16;
  const morphDuration = 500;

  const animationScript = document.getElementById('animations');
  const firstShape = animationScript?.dataset.firstShape || 'home';

  const pointCanvas = document.getElementById('point-canvas');
  const svgGroup = document.getElementById('dots-layer');
  const svgBox = document.getElementById('svg-box');
  const graphDemoStatus = document.getElementById('graph-demo-status');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let allDots = [];
  let demoTimers = [];
  let demoSequence = 0;
  let activeDemo = null;
  let currentShapeKey = firstShape;
  let morphCleanupTimers = [];
  let morphCleanupListeners = [];
  let morphAnimationFrame = null;
  let carriedMorphDots = [];
  let morphSequence = 0;

  if (!pointCanvas || !svgGroup || !svgBox) return;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const canvasSize = spacing * size + 2 * radius;

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

  const shapeLabels = {
    home: 'home',
    pub: 'publications',
    talks: 'talks',
    teach: 'teaching',
    cv: 'CV'
  };

  function buildShapeGraph(points) {
    const edges = [];

    for (let left = 0; left < points.length; left++) {
      for (let right = left + 1; right < points.length; right++) {
        const horizontalDistance = Math.abs(points[left][0] - points[right][0]);
        const verticalDistance = Math.abs(points[left][1] - points[right][1]);
        const adjacent = horizontalDistance <= spacing && verticalDistance <= spacing;

        if (adjacent && (horizontalDistance > 0 || verticalDistance > 0)) {
          edges.push([left, right]);
        }
      }
    }

    return { nodes: points, edges };
  }
  function setGraphStatus(message) {
    if (graphDemoStatus) graphDemoStatus.textContent = message;
  }

  function restoreDemoControl() {
    pointCanvas.setAttribute(
      'aria-label',
      'Select a dot to start a maximal independent set demonstration from that node'
    );
    pointCanvas.title = 'Select a dot to start the graph algorithm';
  }

  function cancelDemo() {
    demoSequence += 1;
    demoTimers.forEach(timer => window.clearTimeout(timer));
    demoTimers = [];
    activeDemo = null;
    pointCanvas.classList.remove('is-running');
  }

  function clearMorphArtifacts() {
    morphSequence += 1;
    if (morphAnimationFrame !== null) {
      window.cancelAnimationFrame(morphAnimationFrame);
      morphAnimationFrame = null;
    }
    morphCleanupTimers.forEach(timer => window.clearTimeout(timer));
    morphCleanupTimers = [];
    morphCleanupListeners.forEach(removeListener => removeListener());
    morphCleanupListeners = [];
    svgGroup.querySelectorAll('.is-morph-frozen').forEach(dot => {
      dot.classList.remove('is-morph-frozen');
    });

    // An interrupted merge is still visible. Carry those dots into the next
    // weighted assignment instead of deleting them at their in-flight position.
    const interruptedMerges = [...svgGroup.querySelectorAll('.is-merging')];
    interruptedMerges.forEach(dot => {
      dot.classList.remove('is-merging', 'is-merging-away');
    });
    carriedMorphDots = carriedMorphDots.filter(dot => dot.isConnected);
    const knownDots = new Set(carriedMorphDots);
    interruptedMerges.forEach(dot => {
      if (dot.isConnected && !knownDots.has(dot)) {
        carriedMorphDots.push(dot);
        knownDots.add(dot);
      }
    });
    allDots = allDots.filter(dot => dot.isConnected);
  }

  function dotPosition(dot) {
    const circle = dot.querySelector('circle');
    return [
      Number.parseFloat(circle?.getAttribute('cx') || '0'),
      Number.parseFloat(circle?.getAttribute('cy') || '0')
    ];
  }

  function setDotPosition(dot, [x, y]) {
    const circle = dot.querySelector('circle');
    if (!circle) return;
    circle.setAttribute('cx', x.toString());
    circle.setAttribute('cy', y.toString());
  }

  function renderedDotPosition(dot) {
    const circle = dot.querySelector('circle');
    const transform = svgBox.getScreenCTM();
    if (!circle || !transform) return dotPosition(dot);

    const bounds = circle.getBoundingClientRect();
    const center = svgBox.createSVGPoint();
    center.x = bounds.left + bounds.width / 2;
    center.y = bounds.top + bounds.height / 2;
    const localCenter = center.matrixTransform(transform.inverse());
    return [localCenter.x, localCenter.y];
  }

  function pointDistance([leftX, leftY], [rightX, rightY]) {
    return Math.hypot(rightX - leftX, rightY - leftY);
  }

  function nearestPointIndex(points, [targetX, targetY]) {
    return points.reduce((nearestIndex, [pointX, pointY], index) => {
      const [nearestX, nearestY] = points[nearestIndex];
      const distance = Math.hypot(targetX - pointX, targetY - pointY);
      const nearestDistance = Math.hypot(targetX - nearestX, targetY - nearestY);
      return distance < nearestDistance ? index : nearestIndex;
    }, 0);
  }

  // Minimum-weight assignment for a rectangular matrix with rows <= columns.
  // This is the Hungarian (Kuhn-Munkres) algorithm, kept local to avoid a
  // parser-blocking third-party script for a small decorative animation.
  function hungarianAssignment(costMatrix) {
    const rowCount = costMatrix.length;
    const columnCount = costMatrix[0]?.length ?? 0;
    if (rowCount === 0 || columnCount === 0) return [];
    if (rowCount > columnCount) {
      throw new Error('Hungarian assignment requires no more rows than columns.');
    }

    const rowPotential = Array(rowCount + 1).fill(0);
    const columnPotential = Array(columnCount + 1).fill(0);
    const matchedRow = Array(columnCount + 1).fill(0);
    const previousColumn = Array(columnCount + 1).fill(0);

    for (let row = 1; row <= rowCount; row++) {
      matchedRow[0] = row;
      let currentColumn = 0;
      const minimumReducedCost = Array(columnCount + 1).fill(Number.POSITIVE_INFINITY);
      const usedColumn = Array(columnCount + 1).fill(false);

      do {
        usedColumn[currentColumn] = true;
        const currentRow = matchedRow[currentColumn];
        let delta = Number.POSITIVE_INFINITY;
        let nextColumn = 0;

        for (let column = 1; column <= columnCount; column++) {
          if (usedColumn[column]) continue;

          const reducedCost = costMatrix[currentRow - 1][column - 1] -
            rowPotential[currentRow] - columnPotential[column];
          if (reducedCost < minimumReducedCost[column]) {
            minimumReducedCost[column] = reducedCost;
            previousColumn[column] = currentColumn;
          }
          if (minimumReducedCost[column] < delta) {
            delta = minimumReducedCost[column];
            nextColumn = column;
          }
        }

        for (let column = 0; column <= columnCount; column++) {
          if (usedColumn[column]) {
            rowPotential[matchedRow[column]] += delta;
            columnPotential[column] -= delta;
          } else {
            minimumReducedCost[column] -= delta;
          }
        }

        currentColumn = nextColumn;
      } while (matchedRow[currentColumn] !== 0);

      do {
        const nextColumn = previousColumn[currentColumn];
        matchedRow[currentColumn] = matchedRow[nextColumn];
        currentColumn = nextColumn;
      } while (currentColumn !== 0);
    }

    const assignment = [];
    for (let column = 1; column <= columnCount; column++) {
      if (matchedRow[column] !== 0) {
        assignment.push([matchedRow[column] - 1, column - 1]);
      }
    }
    return assignment.sort(([leftRow], [rightRow]) => leftRow - rightRow);
  }

  function minimumWeightMorphMatching(sourcePoints, targetPoints) {
    if (sourcePoints.length <= targetPoints.length) {
      const costs = sourcePoints.map(source =>
        targetPoints.map(target => pointDistance(source, target))
      );

      return hungarianAssignment(costs).map(([sourceIndex, targetIndex]) => ({
        sourceIndex,
        targetIndex
      }));
    }

    const costs = targetPoints.map(target =>
      sourcePoints.map(source => pointDistance(source, target))
    );

    return hungarianAssignment(costs).map(([targetIndex, sourceIndex]) => ({
      sourceIndex,
      targetIndex
    }));
  }

  function createDot([x, y]) {
    const group = document.createElementNS(svgNamespace, 'g');
    const circle = document.createElementNS(svgNamespace, 'circle');
    circle.setAttribute('cx', x.toString());
    circle.setAttribute('cy', y.toString());
    circle.setAttribute('r', radius.toString());
    group.appendChild(circle);
    svgGroup.appendChild(group);
    return group;
  }

  function cleanUpMergingDots(mergingDots, sequence) {
    const pendingDots = new Set(mergingDots);
    const removeListeners = [];
    let cleanupQueued = false;
    let fallbackTimer;

    const detachListeners = () => {
      removeListeners.forEach(removeListener => removeListener());
      morphCleanupListeners = morphCleanupListeners.filter(
        removeListener => !removeListeners.includes(removeListener)
      );
    };

    const queueCleanup = () => {
      if (cleanupQueued) return;
      cleanupQueued = true;
      detachListeners();
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
        morphCleanupTimers = morphCleanupTimers.filter(timer => timer !== fallbackTimer);
      }
      if (sequence !== morphSequence) return;

      // Opacity has reached zero, so removal no longer changes the antialiased
      // edge of the surviving dot underneath it.
      morphAnimationFrame = window.requestAnimationFrame(() => {
        if (sequence !== morphSequence) return;
        morphAnimationFrame = null;
        mergingDots.forEach(dot => {
          if (dot.classList.contains('is-merging')) dot.remove();
        });
      });
    };

    mergingDots.forEach(dot => {
      const onTransitionEnd = event => {
        if (event.target !== dot || event.propertyName !== 'opacity') return;
        pendingDots.delete(dot);
        if (pendingDots.size === 0) queueCleanup();
      };
      const removeListener = () => dot.removeEventListener('transitionend', onTransitionEnd);
      removeListeners.push(removeListener);
      morphCleanupListeners.push(removeListener);
      dot.addEventListener('transitionend', onTransitionEnd);
    });

    // Defensive fallback for background tabs or browsers that suppress a
    // transition event. It is deliberately not the primary cleanup clock.
    fallbackTimer = window.setTimeout(queueCleanup, morphDuration * 2);
    morphCleanupTimers.push(fallbackTimer);
  }

  function resetGraphPresentation() {
    clearMorphArtifacts();
    svgGroup.classList.remove('is-graph');
    pointCanvas.classList.remove('is-demo', 'is-running');

    allDots.forEach(dot => {
      dot.classList.remove(
        'graph-node',
        'is-active',
        'is-candidate',
        'is-selected',
        'is-excluded'
      );
      dot.querySelector('circle')?.setAttribute('r', radius.toString());
    });
  }

  function setup(points) {
    resetGraphPresentation();
    svgGroup.replaceChildren();
    carriedMorphDots = [];
    allDots = points.map(createDot);
  }

  function animateTo(targetPoints) {
    if (!targetPoints?.length) return;

    if (reducedMotion?.matches) {
      setup(targetPoints);
      return;
    }

    clearMorphArtifacts();

    const sourceDots = [...new Set([...allDots, ...carriedMorphDots])]
      .filter(dot => dot.isConnected);
    carriedMorphDots = [];
    if (!sourceDots.length) {
      setup(targetPoints);
      return;
    }

    const sourcePoints = sourceDots.map(renderedDotPosition);

    // Firefox can retain the previous transform endpoint while a CSS
    // transition is visibly between positions. Freeze every physical dot at
    // its rendered position before rematching so rapid hover changes always
    // continue from what is actually on screen.
    sourceDots.forEach((dot, index) => {
      dot.classList.add('is-morph-frozen');
      setDotPosition(dot, sourcePoints[index]);
    });

    const matches = minimumWeightMorphMatching(sourcePoints, targetPoints);
    const usedSources = new Set(matches.map(({ sourceIndex }) => sourceIndex));

    const nextDots = Array(targetPoints.length);
    const movements = [];
    matches.forEach(({ sourceIndex, targetIndex }) => {
      const dot = sourceDots[sourceIndex];
      nextDots[targetIndex] = dot;
      movements.push({ dot, point: targetPoints[targetIndex] });
    });

    const mergingDots = [];
    sourceDots.forEach((dot, sourceIndex) => {
      if (usedSources.has(sourceIndex)) return;

      const mergePoint = targetPoints[
        nearestPointIndex(targetPoints, sourcePoints[sourceIndex])
      ];

      dot.classList.add('is-merging');
      mergingDots.push(dot);
      movements.push({ dot, point: mergePoint });
    });

    targetPoints.forEach((point, targetIndex) => {
      if (nextDots[targetIndex]) return;

      // Extra targets are handled outside the one-to-one matching: each split
      // starts at the globally closest currently rendered source dot.
      const sourceIndex = nearestPointIndex(sourcePoints, point);

      const dot = sourceDots[sourceIndex].cloneNode(true);
      setDotPosition(dot, sourcePoints[sourceIndex]);
      svgGroup.appendChild(dot);
      nextDots[targetIndex] = dot;
      movements.push({ dot, point });
    });

    // Commit every frozen source position before moving. The first frame
    // restores transitions at those exact positions; the second starts the
    // morph. This prevents Firefox from restarting at a stale endpoint.
    svgGroup.getBoundingClientRect();
    const sequence = morphSequence;
    morphAnimationFrame = window.requestAnimationFrame(() => {
      if (sequence !== morphSequence) return;
      const movingDots = [...new Set(movements.map(({ dot }) => dot))];
      movingDots.forEach(dot => dot.classList.remove('is-morph-frozen'));
      const firstMovingCircle = movingDots[0]?.querySelector('circle');
      if (firstMovingCircle) {
        void window.getComputedStyle(firstMovingCircle).transitionDuration;
      }

      morphAnimationFrame = window.requestAnimationFrame(() => {
        if (sequence !== morphSequence) return;
        morphAnimationFrame = null;
        movements.forEach(({ dot, point }) => setDotPosition(dot, point));

        if (mergingDots.length > 0) {
          cleanUpMergingDots(mergingDots, sequence);
          mergingDots.forEach(dot => dot.classList.add('is-merging-away'));
        }
      });
    });

    allDots = nextDots;
  }

  function computeSeededMisRounds(graph, seed) {
    const neighbors = Array.from({ length: graph.nodes.length }, () => new Set());
    graph.edges.forEach(([left, right]) => {
      neighbors[left].add(right);
      neighbors[right].add(left);
    });

    const remaining = new Set(graph.nodes.map((_, index) => index));

    const takeComponent = start => {
      const component = [];
      const queue = [start];
      remaining.delete(start);

      for (let cursor = 0; cursor < queue.length; cursor++) {
        const node = queue[cursor];
        component.push(node);
        neighbors[node].forEach(neighbor => {
          if (!remaining.has(neighbor)) return;
          remaining.delete(neighbor);
          queue.push(neighbor);
        });
      }

      return component;
    };

    const distanceFromSeed = node =>
      Math.hypot(
        graph.nodes[node][0] - graph.nodes[seed][0],
        graph.nodes[node][1] - graph.nodes[seed][1]
      );

    const components = [takeComponent(seed)];
    while (remaining.size > 0) {
      const nextSeed = [...remaining].reduce((nearest, node) =>
        distanceFromSeed(node) < distanceFromSeed(nearest) ? node : nearest
      );
      components.push(takeComponent(nextSeed));
    }

    const roundsForComponent = (component, componentSeed) => {
      const distances = Array(graph.nodes.length).fill(Number.POSITIVE_INFINITY);
      const queue = [componentSeed];
      distances[componentSeed] = 0;

      for (let cursor = 0; cursor < queue.length; cursor++) {
        const node = queue[cursor];
        neighbors[node].forEach(neighbor => {
          if (distances[neighbor] !== Number.POSITIVE_INFINITY) return;
          distances[neighbor] = distances[node] + 1;
          queue.push(neighbor);
        });
      }

      const hasHigherPriority = (node, neighbor) =>
        distances[node] < distances[neighbor] ||
        (distances[node] === distances[neighbor] && node < neighbor);
      const active = new Set(component);
      const rounds = [];

      while (active.size > 0) {
        const winners = [...active].filter(node =>
          [...neighbors[node]].every(neighbor =>
            !active.has(neighbor) || hasHigherPriority(node, neighbor)
          )
        );
        const winnerSet = new Set(winners);
        const excluded = new Set();

        winners.forEach(winner => {
          neighbors[winner].forEach(neighbor => {
            if (active.has(neighbor) && !winnerSet.has(neighbor)) excluded.add(neighbor);
          });
        });

        winners.forEach(winner => active.delete(winner));
        excluded.forEach(neighbor => active.delete(neighbor));
        rounds.push({ winners, excluded: [...excluded] });
      }

      return rounds;
    };

    const seededRounds = roundsForComponent(components[0], seed);
    const remainingRoundSets = components.slice(1).map(component => {
      const componentSeed = component.reduce((nearest, node) =>
        distanceFromSeed(node) < distanceFromSeed(nearest) ? node : nearest
      );
      return roundsForComponent(component, componentSeed);
    });
    const parallelRounds = Array.from(
      { length: Math.max(0, ...remainingRoundSets.map(rounds => rounds.length)) },
      (_, roundIndex) => remainingRoundSets.reduce((combined, rounds) => {
        const round = rounds[roundIndex];
        if (round) {
          combined.winners.push(...round.winners);
          combined.excluded.push(...round.excluded);
        }
        return combined;
      }, { winners: [], excluded: [] })
    );

    return [...seededRounds, ...parallelRounds];
  }

  function nearestNodeToEvent(points, event) {
    let selectedPoint = [canvasSize / 2, canvasSize / 2];
    const transform = svgBox.getScreenCTM();

    if (event.detail !== 0 && transform) {
      const pointer = svgBox.createSVGPoint();
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const localPointer = pointer.matrixTransform(transform.inverse());
      selectedPoint = [localPointer.x, localPointer.y];
    }

    return points.reduce((nearest, point, index) => {
      const distance = Math.hypot(point[0] - selectedPoint[0], point[1] - selectedPoint[1]);
      return distance < nearest.distance ? { index, distance } : nearest;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
  }

  function setNodeState(index, state) {
    const node = allDots[index];
    if (!node) return;

    node.classList.remove('is-active', 'is-candidate', 'is-selected', 'is-excluded');
    node.classList.add(`is-${state}`);
  }

  function renderGraph(graph) {
    resetGraphPresentation();
    svgGroup.replaceChildren();
    carriedMorphDots = [];
    svgGroup.classList.add('is-graph');
    pointCanvas.classList.add('is-demo', 'is-running');

    allDots = graph.nodes.map(([x, y]) => {
      const group = document.createElementNS(svgNamespace, 'g');
      group.classList.add('graph-node', 'is-active');

      const circle = document.createElementNS(svgNamespace, 'circle');
      circle.setAttribute('cx', x.toString());
      circle.setAttribute('cy', y.toString());
      circle.setAttribute('r', '4');
      group.appendChild(circle);
      svgGroup.appendChild(group);
      return group;
    });
  }

  function scheduleDemo(callback, delay, sequence) {
    const timer = window.setTimeout(() => {
      if (sequence === demoSequence) callback();
    }, delay);
    demoTimers.push(timer);
  }

  function completeDemo(graph, rounds, shapeLabel) {
    const selectedCount = rounds.reduce((total, round) => total + round.winners.length, 0);
    activeDemo = null;
    pointCanvas.classList.remove('is-running');
    pointCanvas.setAttribute(
      'aria-label',
      `${shapeLabel} matrix complete. Select a dot to start from that node.`
    );
    pointCanvas.title = 'Select a dot to start the graph algorithm';
    setGraphStatus(
      `${shapeLabel} matrix complete after ${rounds.length} rounds. ` +
      `${selectedCount} of ${graph.nodes.length} nodes joined the maximal independent set.`
    );
  }

  function renderFinalMis(rounds) {
    rounds.forEach(round => {
      round.winners.forEach(node => setNodeState(node, 'selected'));
      round.excluded.forEach(node => setNodeState(node, 'excluded'));
    });
  }

  function runGraphDemo(event) {
    cancelDemo();
    const points = shapes[currentShapeKey] || shapes[firstShape] || shapes.home;
    const graph = buildShapeGraph(points);
    const seed = nearestNodeToEvent(points, event);
    const rounds = computeSeededMisRounds(graph, seed);
    const shapeLabel = shapeLabels[currentShapeKey] || 'current';
    const sequence = demoSequence;
    activeDemo = { graph, rounds, shapeLabel };

    renderGraph(graph);
    pointCanvas.setAttribute(
      'aria-label',
      `Running a maximal independent set demonstration from the selected node in the ${shapeLabel} matrix.`
    );
    pointCanvas.title = `${shapeLabel} matrix: maximal independent set`;
    setGraphStatus(`Starting from the selected node in the ${shapeLabel} matrix.`);

    if (reducedMotion?.matches) {
      renderFinalMis(rounds);
      completeDemo(graph, rounds, shapeLabel);
      return;
    }

    let delay = 0;
    rounds.forEach(round => {
      scheduleDemo(() => {
        round.winners.forEach(node => setNodeState(node, 'candidate'));
      }, delay, sequence);

      delay += 55;
      scheduleDemo(() => {
        round.winners.forEach(node => setNodeState(node, 'selected'));
        round.excluded.forEach(node => setNodeState(node, 'excluded'));
      }, delay, sequence);

      delay += 65;
    });

    scheduleDemo(() => completeDemo(graph, rounds, shapeLabel), delay, sequence);
  }

  document.querySelectorAll('.header-menu [data-shape]').forEach(element => {
    const showShape = () => {
      const key = element.dataset.shape;
      if (!shapes[key]) return;

      cancelDemo();
      resetGraphPresentation();
      restoreDemoControl();
      setGraphStatus('');
      currentShapeKey = key;
      animateTo(shapes[key]);
    };

    element.addEventListener('pointerenter', showShape);
    element.addEventListener('focusin', showShape);
  });

  pointCanvas.addEventListener('click', runGraphDemo);

  reducedMotion?.addEventListener?.('change', event => {
    if (!event.matches || !activeDemo || !pointCanvas.classList.contains('is-running')) return;

    const { graph, rounds, shapeLabel } = activeDemo;
    cancelDemo();
    renderFinalMis(rounds);
    completeDemo(graph, rounds, shapeLabel);
  });

  if (!shapes[currentShapeKey]) currentShapeKey = 'home';
  setup(shapes[firstShape] || shapes.home);
  restoreDemoControl();

  svgBox.setAttribute('width', canvasSize);
  svgBox.setAttribute('height', canvasSize);
  svgBox.setAttribute('viewBox', `0 0 ${canvasSize} ${canvasSize}`);
  svgBox.setAttribute('preserveAspectRatio', 'xMidYMid meet');
});
