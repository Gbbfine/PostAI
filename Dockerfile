# syntax=docker/dockerfile:1.7

FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS frontend-builder

WORKDIR /build
COPY web/default/package.json .
COPY web/default/bun.lock .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install
COPY ./web/default .
COPY ./VERSION .
RUN DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat VERSION) bun run build

FROM golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039 AS backend-builder
ENV GO111MODULE=on CGO_ENABLED=0

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

ADD go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY . .
COPY --from=frontend-builder /build/dist ./web/default/dist
RUN mkdir -p ./web/classic/dist && \
    printf '%s' '<!doctype html><html><head><meta charset="utf-8"><title>Post AI</title></head><body></body></html>' > ./web/classic/dist/index.html
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags "-s -w -X '\''github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'\''" -o new-api

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=backend-builder /build/new-api /
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
