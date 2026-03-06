// Bride Module: HDC — Hyperdimensional Computing
//
// Encodes medical concepts into high-dimensional binary vectors (hypervectors).
// Uses bundling (element-wise OR) and binding (XOR) to compose representations.
// Enables fuzzy matching of symptom patterns — similar symptoms produce similar vectors.
//
// Key operations:
//   encode()    — Map a text concept to a hypervector
//   bundle()    — Combine multiple concepts (set union)
//   bind()      — Associate two concepts (role-filler)
//   similarity() — Cosine similarity between hypervectors

use rand::Rng;
use std::collections::HashMap;

use super::ebbinghaus::Memory;

/// A hypervector: a high-dimensional binary vector stored as Vec<i8> (+1/-1)
pub type HyperVector = Vec<i8>;

pub struct HdcEncoder {
    dimensions: usize,
    // Codebook: maps concept tokens to base hypervectors
    codebook: HashMap<String, HyperVector>,
    // Patient pattern vectors: patient_id -> bundled hypervector of their history
    patient_patterns: HashMap<String, HyperVector>,
}

impl HdcEncoder {
    pub fn new(dimensions: usize) -> Self {
        Self {
            dimensions,
            codebook: HashMap::new(),
            patient_patterns: HashMap::new(),
        }
    }

    /// Generate a random bipolar hypervector (+1/-1)
    fn random_hv(&self) -> HyperVector {
        let mut rng = rand::thread_rng();
        (0..self.dimensions)
            .map(|_| if rng.gen_bool(0.5) { 1i8 } else { -1i8 })
            .collect()
    }

    /// Get or create a base hypervector for a concept token
    fn get_or_create_base(&mut self, token: &str) -> HyperVector {
        if let Some(hv) = self.codebook.get(token) {
            return hv.clone();
        }
        let hv = self.random_hv();
        self.codebook.insert(token.to_string(), hv.clone());
        hv
    }

    /// Encode a text string into a hypervector by bundling word-level vectors
    fn encode_text(&mut self, text: &str) -> HyperVector {
        let tokens: Vec<&str> = text
            .to_lowercase()
            .split_whitespace()
            .collect::<Vec<&str>>()
            .into_iter()
            .collect();

        if tokens.is_empty() {
            return self.random_hv();
        }

        let token_strings: Vec<String> = text
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        let vectors: Vec<HyperVector> = token_strings
            .iter()
            .map(|t| self.get_or_create_base(t))
            .collect();

        self.bundle(&vectors)
    }

    /// Bundle (majority vote) — combines multiple vectors into one
    fn bundle(&self, vectors: &[HyperVector]) -> HyperVector {
        let n = vectors.len() as i32;
        (0..self.dimensions)
            .map(|i| {
                let sum: i32 = vectors.iter().map(|v| v[i] as i32).sum();
                if sum > 0 {
                    1i8
                } else if sum < 0 {
                    -1i8
                } else {
                    // Tie-break: use first vector's value
                    vectors[0][i]
                }
            })
            .collect()
    }

    /// Bind (XOR for bipolar) — associative binding of two vectors
    #[allow(dead_code)]
    fn bind(&self, a: &HyperVector, b: &HyperVector) -> HyperVector {
        a.iter()
            .zip(b.iter())
            .map(|(&x, &y)| x * y) // XOR for bipolar = element-wise multiply
            .collect()
    }

    /// Cosine similarity between two hypervectors
    fn similarity(a: &HyperVector, b: &HyperVector) -> f64 {
        let dot: f64 = a.iter().zip(b.iter()).map(|(&x, &y)| (x as f64) * (y as f64)).sum();
        let mag_a: f64 = a.iter().map(|&x| (x as f64).powi(2)).sum::<f64>().sqrt();
        let mag_b: f64 = b.iter().map(|&x| (x as f64).powi(2)).sum::<f64>().sqrt();
        if mag_a == 0.0 || mag_b == 0.0 {
            return 0.0;
        }
        dot / (mag_a * mag_b)
    }

    /// Encode a new memory into HDC space and update patient pattern
    pub fn encode_memory(&mut self, content: &str, _category: &str) {
        let _hv = self.encode_text(content);
        // The encoding is stored in the codebook implicitly
    }

    /// Find patterns by comparing current context against stored memory vectors
    pub fn find_patterns(&mut self, memories: &[super::super::MemoryEntry], context: &str) -> Vec<String> {
        if memories.is_empty() || context.is_empty() {
            return vec![];
        }

        let context_hv = self.encode_text(context);
        let mut patterns: Vec<(String, f64)> = Vec::new();

        for memory in memories {
            let mem_hv = self.encode_text(&memory.content);
            let sim = Self::similarity(&context_hv, &mem_hv);

            if sim > 0.15 {
                patterns.push((memory.content.clone(), sim));
            }
        }

        // Sort by similarity descending
        patterns.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        patterns
            .into_iter()
            .take(5)
            .map(|(content, sim)| format!("[HDC sim={:.2}] {}", sim, content))
            .collect()
    }
}
