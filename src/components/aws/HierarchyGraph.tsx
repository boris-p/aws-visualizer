import { useEffect } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import awsGeoData from "@/data/aws-geo.json";

const createHierarchyNodes = (): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Root AWS node (left side for horizontal layout)
  nodes.push({
    id: "aws",
    data: { label: "AWS" },
    position: { x: 50, y: 300 },
    sourcePosition: Position.Right,
    style: {
      background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
      border: "3px solid #0066cc",
      borderRadius: "8px",
      padding: "16px 32px",
      fontFamily: "monospace",
      fontSize: "18px",
      fontWeight: "bold",
      color: "#0066cc",
      boxShadow: "0 4px 12px rgba(0, 102, 204, 0.15)",
    },
  });

  // Partition nodes (second column)
  const partitionStartX = 300;
  const partitionSpacingY = 350;

  awsGeoData.partitions.forEach((partition, pIndex) => {
    const partitionId = `partition-${partition.id}`;
    const partitionY = 100 + pIndex * partitionSpacingY;

    const getPartitionBackground = (color: string) => {
      if (color === "#0066cc") return "#f0f7ff"; // aws - light blue
      if (color === "#dc2626") return "#fff5f5"; // aws-cn - light red
      if (color === "#ea580c") return "#fff7ed"; // aws-us-gov - light orange
      return "#ffffff";
    };

    nodes.push({
      id: partitionId,
      data: { label: partition.id },
      position: { x: partitionStartX, y: partitionY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: getPartitionBackground(partition.color),
        border: `2px solid ${partition.color}`,
        borderRadius: "8px",
        padding: "12px 24px",
        fontFamily: "monospace",
        fontSize: "15px",
        color: partition.color,
        fontWeight: "700",
        boxShadow: `0 1px 4px ${partition.color}20`,
        minWidth: "140px",
        textAlign: "center",
      },
    });

    edges.push({
      id: `aws-${partitionId}`,
      source: "aws",
      target: partitionId,
      style: {
        stroke: partition.color,
        strokeWidth: 2,
        opacity: 0.3,
      },
      type: "smoothstep",
    });

    // Sample regions (third column) - 4 per partition
    const regionStartX = partitionStartX + 400;
    const regionSpacingY = 150;

    partition.regions.slice(0, 4).forEach((region, rIndex) => {
      const regionId = `region-${region.id}`;
      const regionY = partitionY - 180 + rIndex * regionSpacingY;

      nodes.push({
        id: regionId,
        data: { label: region.id },
        position: { x: regionStartX, y: regionY },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: "#ffffff",
          border: "2px solid #e5e5e5",
          borderRadius: "6px",
          padding: "10px 18px",
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#555",
          fontWeight: "600",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
          minWidth: "120px",
        },
      });

      edges.push({
        id: `${partitionId}-${regionId}`,
        source: partitionId,
        target: regionId,
        style: {
          stroke: partition.color,
          strokeWidth: 1.5,
          opacity: 0.25,
        },
        type: "smoothstep",
      });

      // Sample AZs (fourth column) - 2 per region
      const azStartX = regionStartX + 350;
      const azSpacingY = 65;

      region.azs.slice(0, 2).forEach((az, aIndex) => {
        const azId = `az-${region.id}-${az.id}`;
        const azY = regionY - 20 + aIndex * azSpacingY;

        nodes.push({
          id: azId,
          data: { label: az.id },
          position: { x: azStartX, y: azY },
          targetPosition: Position.Left,
          style: {
            background: "#fafafa",
            border: "1.5px solid #d4d4d4",
            borderRadius: "4px",
            padding: "6px 14px",
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#888",
            minWidth: "90px",
          },
        });

        edges.push({
          id: `${regionId}-${azId}`,
          source: regionId,
          target: azId,
          style: {
            stroke: partition.color,
            strokeWidth: 1.5,
            opacity: 0.2,
          },
          type: "smoothstep",
        });
      });

      // Sample Data Centers (fifth column) - 2 per AZ
      const dcStartX = azStartX + 300;
      const dcSpacingY = 30;

      region.azs.slice(0, 2).forEach((az, aIndex) => {
        const azId = `az-${region.id}-${az.id}`;
        const azY = regionY - 20 + aIndex * azSpacingY;

        // Add 2 data center nodes per AZ
        for (let dcIndex = 0; dcIndex < 2; dcIndex++) {
          const dcId = `dc-${region.id}-${az.id}-${dcIndex}`;
          const dcY = azY - 10 + dcIndex * dcSpacingY;

          nodes.push({
            id: dcId,
            data: { label: `DC-${dcIndex + 1}` },
            position: { x: dcStartX, y: dcY },
            targetPosition: Position.Left,
            style: {
              background: "#f5f5f5",
              border: "1px solid #e0e0e0",
              borderRadius: "3px",
              padding: "4px 10px",
              fontFamily: "monospace",
              fontSize: "9px",
              color: "#999",
              minWidth: "60px",
            },
          });

          edges.push({
            id: `${azId}-${dcId}`,
            source: azId,
            target: dcId,
            style: {
              stroke: partition.color,
              strokeWidth: 1,
              opacity: 0.15,
            },
            type: "smoothstep",
          });
        }

        // "+N more DCs" indicator
        const moreDcId = `more-dc-${region.id}-${az.id}`;
        nodes.push({
          id: moreDcId,
          data: { label: "+N DCs" },
          position: { x: dcStartX, y: azY + 35 },
          targetPosition: Position.Left,
          style: {
            background: "transparent",
            border: "1px dashed #e0e0e0",
            borderRadius: "3px",
            padding: "3px 8px",
            fontFamily: "monospace",
            fontSize: "8px",
            color: "#bbb",
          },
        });

        edges.push({
          id: `${azId}-${moreDcId}`,
          source: azId,
          target: moreDcId,
          style: { stroke: "#e0e0e0", strokeWidth: 1, strokeDasharray: "3,3", opacity: 0.2 },
          type: "smoothstep",
        });
      });

      // "+N more AZs" indicator
      if (region.azs.length > 2) {
        const moreAzId = `more-az-${region.id}`;
        nodes.push({
          id: moreAzId,
          data: { label: `+${region.azs.length - 2}` },
          position: { x: azStartX, y: regionY + 80 },
          targetPosition: Position.Left,
          style: {
            background: "transparent",
            border: "1px dashed #bbb",
            borderRadius: "4px",
            padding: "4px 10px",
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#999",
          },
        });

        edges.push({
          id: `${regionId}-${moreAzId}`,
          source: regionId,
          target: moreAzId,
          style: { stroke: "#ddd", strokeWidth: 1, strokeDasharray: "4,4", opacity: 0.3 },
          type: "smoothstep",
        });
      }
    });

    // "+N more regions" indicator
    if (partition.regions.length > 4) {
      const moreId = `more-${partition.id}`;
      nodes.push({
        id: moreId,
        data: { label: `+${partition.regions.length - 4} regions` },
        position: { x: regionStartX, y: partitionY + 260 },
        targetPosition: Position.Left,
        style: {
          background: "transparent",
          border: "1.5px dashed #ccc",
          borderRadius: "6px",
          padding: "8px 16px",
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#999",
        },
      });

      edges.push({
        id: `${partitionId}-${moreId}`,
        source: partitionId,
        target: moreId,
        style: { stroke: "#ddd", strokeWidth: 1.5, strokeDasharray: "5,5", opacity: 0.3 },
        type: "smoothstep",
      });
    }
  });

  // Edge Locations (bottom section - separate from region hierarchy)
  const edgeLocationY = 1150;
  const edgeLocationStartX = 300;

  // Edge location hub node
  nodes.push({
    id: "edge-locations",
    data: { label: "Edge Locations" },
    position: { x: edgeLocationStartX, y: edgeLocationY },
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
    style: {
      background: "#f0fdf4",
      border: "2px solid #16a34a",
      borderRadius: "8px",
      padding: "12px 24px",
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#16a34a",
      fontWeight: "700",
      boxShadow: "0 1px 4px rgba(22, 163, 74, 0.2)",
      minWidth: "140px",
      textAlign: "center",
    },
  });

  edges.push({
    id: "aws-edge-locations",
    source: "aws",
    target: "edge-locations",
    style: {
      stroke: "#16a34a",
      strokeWidth: 2,
      opacity: 0.3,
    },
    type: "smoothstep",
  });

  // Sample edge locations (representative cities)
  const sampleEdgeLocations = [
    { id: "edge-nyc", label: "New York", count: 8 },
    { id: "edge-lon", label: "London", count: 12 },
    { id: "edge-tok", label: "Tokyo", count: 18 },
    { id: "edge-syd", label: "Sydney", count: 5 },
    { id: "edge-sfo", label: "San Francisco", count: 7 },
  ];

  const edgeLocSpacingY = 65;
  const edgeLocStartX = edgeLocationStartX + 400;

  sampleEdgeLocations.forEach((edgeLoc, index) => {
    const edgeLocY = edgeLocationY - 120 + index * edgeLocSpacingY;

    nodes.push({
      id: edgeLoc.id,
      data: { label: `${edgeLoc.label} (${edgeLoc.count})` },
      position: { x: edgeLocStartX, y: edgeLocY },
      targetPosition: Position.Left,
      style: {
        background: "#fafafa",
        border: "1.5px solid #86efac",
        borderRadius: "4px",
        padding: "6px 14px",
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#16a34a",
        minWidth: "120px",
      },
    });

    edges.push({
      id: `edge-locations-${edgeLoc.id}`,
      source: "edge-locations",
      target: edgeLoc.id,
      style: {
        stroke: "#16a34a",
        strokeWidth: 1.5,
        opacity: 0.2,
      },
      type: "smoothstep",
    });
  });

  // "+N more" indicator for edge locations
  nodes.push({
    id: "more-edge-locations",
    data: { label: "+450 locations" },
    position: { x: edgeLocStartX, y: edgeLocationY + 210 },
    targetPosition: Position.Left,
    style: {
      background: "transparent",
      border: "1.5px dashed #86efac",
      borderRadius: "6px",
      padding: "8px 16px",
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#16a34a",
    },
  });

  edges.push({
    id: "edge-locations-more",
    source: "edge-locations",
    target: "more-edge-locations",
    style: { stroke: "#86efac", strokeWidth: 1.5, strokeDasharray: "5,5", opacity: 0.3 },
    type: "smoothstep",
  });

  return { nodes, edges };
};

interface HierarchyGraphProps {
  visiblePartitions: Set<string>
  showEdgeLocations: boolean
  showDataCenters: boolean
}

export default function HierarchyGraph({
  visiblePartitions,
  showEdgeLocations,
  showDataCenters
}: HierarchyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const { nodes: hierarchyNodes, edges: hierarchyEdges } =
      createHierarchyNodes();

    // Filter nodes and edges based on visible partitions and edge locations
    const filteredNodes = hierarchyNodes.filter(node => {
      // Always show AWS root node
      if (node.id === 'aws') return true;

      // Handle edge locations
      if (node.id === 'edge-locations' || node.id.startsWith('edge-') || node.id === 'more-edge-locations') {
        return showEdgeLocations;
      }

      // Handle data centers
      if (node.id.startsWith('dc-') || node.id.startsWith('more-dc-')) {
        return showDataCenters;
      }

      // Handle partition nodes
      if (node.id.startsWith('partition-')) {
        const partitionId = node.id.replace('partition-', '');
        return visiblePartitions.has(partitionId);
      }

      // Handle region, AZ, and "more" nodes - check if their partition is visible
      for (const partition of awsGeoData.partitions) {
        if (visiblePartitions.has(partition.id)) {
          // Check if this node belongs to a visible partition
          if (node.id.startsWith('region-')) {
            const regionId = node.id.replace('region-', '');
            if (partition.regions.some(r => r.id === regionId)) return true;
          }
          if (node.id.startsWith('az-')) {
            // AZ ID format: az-{region.id}-{az.id}
            // Extract region ID by removing 'az-' prefix and the last segment
            const parts = node.id.split('-');
            // Remove 'az' from the beginning
            parts.shift();
            // Remove the AZ identifier from the end (e.g., 'use1', 'az1')
            parts.pop();
            parts.pop(); // Remove one more part for the AZ number
            const regionId = parts.join('-');
            if (partition.regions.some(r => r.id === regionId)) return true;
          }
          if (node.id.startsWith('more-az-')) {
            const regionId = node.id.replace('more-az-', '');
            if (partition.regions.some(r => r.id === regionId)) return true;
          }
          if (node.id.startsWith('more-')) {
            const partitionIdFromMore = node.id.replace('more-', '');
            if (partition.id === partitionIdFromMore) return true;
          }
        }
      }

      return false;
    });

    const filteredEdges = hierarchyEdges.filter(edge => {
      // Only keep edges where both source and target are in filtered nodes
      return filteredNodes.some(n => n.id === edge.source) &&
             filteredNodes.some(n => n.id === edge.target);
    });

    setNodes(filteredNodes);
    setEdges(filteredEdges);
  }, [setNodes, setEdges, visiblePartitions, showEdgeLocations, showDataCenters]);

  return (
    <div className="w-full h-full bg-[#fafafa]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.3}
        maxZoom={1.2}
        defaultEdgeOptions={{
          animated: false,
        }}
      >
        <Background color="#e5e5e5" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="absolute top-14 left-6 font-mono text-xs text-[#666] space-y-1">
        <div>
          <span className="text-[#0066cc] font-semibold">AWS</span>
          <span className="mx-1.5">→</span>
          <span>Partition</span>
          <span className="mx-1.5">→</span>
          <span>Region</span>
          <span className="mx-1.5">→</span>
          <span>AZ</span>
          <span className="mx-1.5">→</span>
          <span>Data Centers</span>
        </div>
        <div>
          <span className="text-[#0066cc] font-semibold">AWS</span>
          <span className="mx-1.5">→</span>
          <span className="text-[#16a34a]">Edge Locations</span>
          <span className="text-[#999] ml-2">(CloudFront CDN)</span>
        </div>
      </div>
    </div>
  );
}
