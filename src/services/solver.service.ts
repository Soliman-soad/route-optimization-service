export const solveRoute = (matrix: number[][]) => {
    const stops = matrix.length - 1;
  
    const sequence = [];
  
    for (let i = 1; i <= stops; i++) {
      sequence.push(i);
    }
  
    return sequence;
  };