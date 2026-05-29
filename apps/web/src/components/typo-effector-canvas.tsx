"use client";

import { Maximize2, Minus, Move, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  renderTypoEffectToCanvas,
  type TypoEffectParams,
  type TypoEffectPlacement,
  type TypoEffectRenderResult,
  type TypoLayerParams
} from "@/lib/typo-effector/render";

type TypoEffectorCanvasProps = {
  backgroundUrl?: string | null;
  className?: string;
  effectParams?: TypoEffectParams | null;
  imageUrl: string;
  layerParams?: TypoLayerParams | null;
  onPlacementChange?: (placement: TypoEffectPlacement) => void;
  onRender?: (result: TypoEffectRenderResult) => void;
  placement?: TypoEffectPlacement | null;
  presetId: string;
};

type DragState = {
  mode: "move" | "resize" | "rotate";
  pointerId: number;
  startPoint: { x: number; y: number };
  placement: TypoEffectPlacement;
  center: { x: number; y: number };
  startDistance: number;
  startAngle: number;
};

type CanvasMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ViewportState = {
  scale: number;
  x: number;
  y: number;
};

type ViewportDragState = {
  pointerId: number;
  startClient: { x: number; y: number };
  viewport: ViewportState;
};

export function TypoEffectorCanvas({
  backgroundUrl,
  className,
  effectParams,
  imageUrl,
  layerParams,
  onPlacementChange,
  onRender,
  placement,
  presetId
}: TypoEffectorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewportDragRef = useRef<ViewportDragState | null>(null);
  const onRenderRef = useRef(onRender);
  const [canvasMetrics, setCanvasMetrics] = useState<CanvasMetrics | null>(null);
  const [status, setStatus] = useState<"rendering" | "ready" | "failed">("rendering");
  const [renderResult, setRenderResult] = useState<TypoEffectRenderResult | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    onRenderRef.current = onRender;
  }, [onRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;
    if (!canvas) {
      return;
    }

    setStatus("rendering");
    renderTypoEffectToCanvas({ backgroundUrl, effectParams, imageUrl, layerParams, placement, presetId, targetCanvas: canvas })
      .then((result) => {
        if (!cancelled) {
          setRenderResult(result);
          onRenderRef.current?.(result);
          setStatus("ready");
          requestAnimationFrame(updateCanvasMetrics);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backgroundUrl, effectParams, imageUrl, layerParams, placement, presetId]);

  useEffect(() => {
    updateCanvasMetrics();
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    const stage = stageRef.current;
    if (!canvas || !frame || !stage) {
      return;
    }

    const resizeObserver = new ResizeObserver(updateCanvasMetrics);
    resizeObserver.observe(canvas);
    resizeObserver.observe(frame);
    resizeObserver.observe(stage);
    window.addEventListener("resize", updateCanvasMetrics);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCanvasMetrics);
    };
  }, [renderResult?.outputWidth, renderResult?.outputHeight]);

  function updateCanvasMetrics() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (!canvas.clientWidth || !canvas.clientHeight) {
      return;
    }
    setCanvasMetrics({
      left: canvas.offsetLeft,
      top: canvas.offsetTop,
      width: canvas.clientWidth,
      height: canvas.clientHeight
    });
  }

  function pointerToCanvas(event: ReactPointerEvent<HTMLElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>, mode: DragState["mode"]) {
    if (!onPlacementChange || !renderResult) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = pointerToCanvas(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const center = getPlacementCenter(renderResult);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startPoint: point,
      placement: renderResult.placement,
      center,
      startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
      startAngle: Math.atan2(point.y - center.y, point.x - center.x)
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const currentResult = renderResult;
    if (!drag || drag.pointerId !== event.pointerId || !onPlacementChange || !currentResult) {
      return;
    }
    const point = pointerToCanvas(event);
    if (!point) {
      return;
    }
    if (drag.mode === "move") {
      onPlacementChange({
        ...drag.placement,
        x: drag.placement.x + point.x - drag.startPoint.x,
        y: drag.placement.y + point.y - drag.startPoint.y
      });
      return;
    }

    if (drag.mode === "resize") {
      const distance = Math.max(1, Math.hypot(point.x - drag.center.x, point.y - drag.center.y));
      const nextScale = clamp(drag.placement.scale * (distance / drag.startDistance), 0.05, 8);
      onPlacementChange({
        ...drag.placement,
        scale: nextScale,
        x: drag.center.x - (currentResult.materialWidth * nextScale) / 2,
        y: drag.center.y - (currentResult.materialHeight * nextScale) / 2
      });
      return;
    }

    const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
    onPlacementChange({
      ...drag.placement,
      rotation: clamp(drag.placement.rotation + ((angle - drag.startAngle) * 180) / Math.PI, -180, 180)
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
    if (viewportDragRef.current?.pointerId === event.pointerId) {
      viewportDragRef.current = null;
    }
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".effect-transform-box") || target.closest(".viewport-controls")) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    viewportDragRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      viewport
    };
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = viewportDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setViewport({
      ...drag.viewport,
      x: drag.viewport.x + event.clientX - drag.startClient.x,
      y: drag.viewport.y + event.clientY - drag.startClient.y
    });
  }

  function zoomViewport(delta: number) {
    setViewport((current) => ({
      ...current,
      scale: clamp(Number((current.scale + delta).toFixed(2)), 0.5, 3)
    }));
  }

  function resetViewport() {
    setViewport({ scale: 1, x: 0, y: 0 });
  }

  return (
    <div
      ref={frameRef}
      className={`typo-effector-frame${onPlacementChange ? " editable" : ""}${className ? ` ${className}` : ""}`}
      data-status={status}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={handleViewportPointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="viewport-controls" aria-label="보기 조절">
        <button aria-label="축소" onClick={() => zoomViewport(-0.1)} type="button">
          <Minus size={14} />
        </button>
        <strong>{Math.round(viewport.scale * 100)}%</strong>
        <button aria-label="확대" onClick={() => zoomViewport(0.1)} type="button">
          <Plus size={14} />
        </button>
        <button aria-label="맞춤" onClick={resetViewport} type="button">
          <Maximize2 size={14} />
        </button>
        <Move size={14} aria-hidden="true" />
      </div>
      <div
        ref={stageRef}
        className="typo-effector-stage"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
        }}
      >
        <canvas ref={canvasRef} />
        {onPlacementChange && renderResult ? (
          <div
            className="effect-transform-box"
            onPointerDown={(event) => handlePointerDown(event, "move")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={getTransformBoxStyle(renderResult, canvasMetrics)}
          >
            <span
              aria-hidden="true"
              className="transform-handle rotate-handle"
              onPointerDown={(event) => handlePointerDown(event, "rotate")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <span
              aria-hidden="true"
              className="transform-handle resize-handle"
              onPointerDown={(event) => handlePointerDown(event, "resize")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>
        ) : null}
      </div>
      {status === "rendering" ? <span className="typo-effector-status">효과 적용 중</span> : null}
      {status === "failed" ? <span className="typo-effector-status">효과를 표시하지 못했어요</span> : null}
    </div>
  );
}

function getPlacementCenter(result: TypoEffectRenderResult) {
  return {
    x: result.placement.x + (result.materialWidth * result.placement.scale) / 2,
    y: result.placement.y + (result.materialHeight * result.placement.scale) / 2
  };
}

function getTransformBoxStyle(result: TypoEffectRenderResult, metrics: CanvasMetrics | null) {
  if (metrics) {
    const scaleX = metrics.width / result.outputWidth;
    const scaleY = metrics.height / result.outputHeight;
    return {
      left: `${metrics.left + result.placement.x * scaleX}px`,
      top: `${metrics.top + result.placement.y * scaleY}px`,
      width: `${result.materialWidth * result.placement.scale * scaleX}px`,
      height: `${result.materialHeight * result.placement.scale * scaleY}px`,
      transform: `rotate(${result.placement.rotation}deg)`
    };
  }

  return {
    left: `${(result.placement.x / result.outputWidth) * 100}%`,
    top: `${(result.placement.y / result.outputHeight) * 100}%`,
    width: `${((result.materialWidth * result.placement.scale) / result.outputWidth) * 100}%`,
    height: `${((result.materialHeight * result.placement.scale) / result.outputHeight) * 100}%`,
    transform: `rotate(${result.placement.rotation}deg)`
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
