FROM rust:1.82-slim as builder

WORKDIR /app
COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/memory-agent /usr/local/bin/memory-agent

ENV RUST_LOG=info

EXPOSE 10021

CMD ["memory-agent"]
