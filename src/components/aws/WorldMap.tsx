import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import type { Region, PartitionId, Partition } from '@/types/aws'
import awsGeoData from '@/data/aws-geo.json'
import edgeLocationsData from '@/data/aws-edge-locations.json'
import RegionTooltip from './RegionTooltip'
import GenericTooltip from './GenericTooltip'

interface WorldMapProps {
  visiblePartitions: Set<PartitionId>
  onSelectRegion: (region: Region | null) => void
  selectedRegion: Region | null
  showEdgeLocations: boolean
  onSelectEdgeLocation: (edgeLocation: EdgeLocation | null) => void
  selectedEdgeLocation: EdgeLocation | null
}

interface TooltipState {
  region: Region
  partition: Partition
  x: number
  y: number
}

interface EdgeLocation {
  city: string
  country: string
  lat: number
  lon: number
  count: number
}

interface EdgeTooltipState {
  edgeLocation: EdgeLocation
  x: number
  y: number
}

export default function WorldMap({
  visiblePartitions,
  onSelectRegion,
  selectedRegion,
  showEdgeLocations,
  onSelectEdgeLocation,
  selectedEdgeLocation,
}: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [worldData, setWorldData] = useState<any>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState | null>(null)

  useEffect(() => {
    d3.json(
      'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
    ).then((data) => {
      setWorldData(data)
    })
  }, [])

  useEffect(() => {
    if (!svgRef.current || !worldData) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll('*').remove()

    const projection = d3
      .geoNaturalEarth1()
      .scale(width / 5.5)
      .translate([width / 2, height / 2])

    const path = d3.geoPath().projection(projection)

    const g = svg.append('g')

    // Draw countries
    const countries = (worldData as any).objects.countries
    const land = topojson.feature(worldData, countries) as any

    g.selectAll('path.country')
      .data(land.features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', path as any)
      .attr('fill', '#f5f5f5')
      .attr('stroke', '#d4d4d4')
      .attr('stroke-width', 0.5)

    // Draw region dots
    const partitions = awsGeoData.partitions as Partition[]

    partitions.forEach((partition) => {
      if (!visiblePartitions.has(partition.id as PartitionId)) return

      partition.regions.forEach((region) => {
        const [x, y] = projection([region.lon, region.lat]) || [0, 0]
        const radius = 4 + region.azs.length * 1.5
        const isSelected = selectedRegion?.id === region.id

        g.append('circle')
          .attr('cx', x)
          .attr('cy', y)
          .attr('r', radius)
          .attr('fill', partition.color)
          .attr('opacity', isSelected ? 1 : 0.9)
          .attr('stroke', isSelected ? '#000' : 'none')
          .attr('stroke-width', isSelected ? 2 : 0)
          .style('cursor', 'pointer')
          .style('filter', `drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))`)
          .on('mouseenter', (event) => {
            d3.select(event.target).attr('opacity', 1)
            setTooltip({
              region,
              partition,
              x: event.pageX,
              y: event.pageY,
            })
          })
          .on('mousemove', (event) => {
            setTooltip((prev) =>
              prev ? { ...prev, x: event.pageX, y: event.pageY } : null
            )
          })
          .on('mouseleave', (event) => {
            d3.select(event.target).attr('opacity', isSelected ? 1 : 0.9)
            setTooltip(null)
          })
          .on('click', () => {
            onSelectRegion(region)

            // Animate zoom to region
            const scale = 3
            const [cx, cy] = projection([region.lon, region.lat]) || [0, 0]
            const translateX = width / 2 - cx * scale
            const translateY = height / 2 - cy * scale

            svg
              .transition()
              .duration(750)
              .call(
                zoom.transform as any,
                d3.zoomIdentity.translate(translateX, translateY).scale(scale)
              )
          })
      })
    })

    // Draw edge locations
    if (showEdgeLocations) {
      edgeLocationsData.edgeLocations.forEach((edgeLoc) => {
        const [x, y] = projection([edgeLoc.lon, edgeLoc.lat]) || [0, 0]
        const radius = 2 + edgeLoc.count * 0.3
        const isSelected = selectedEdgeLocation?.city === edgeLoc.city

        g.append('circle')
          .attr('cx', x)
          .attr('cy', y)
          .attr('r', radius)
          .attr('fill', '#16a34a')
          .attr('opacity', isSelected ? 1 : 0.6)
          .attr('stroke', isSelected ? '#000' : '#16a34a')
          .attr('stroke-width', isSelected ? 2 : 0.5)
          .style('cursor', 'pointer')
          .style('filter', `drop-shadow(0 0.5px 1px rgba(22, 163, 74, 0.3))`)
          .on('mouseenter', (event) => {
            d3.select(event.target).attr('opacity', 1).attr('r', radius * 1.3)
            setEdgeTooltip({
              edgeLocation: edgeLoc,
              x: event.pageX,
              y: event.pageY,
            })
          })
          .on('mousemove', (event) => {
            setEdgeTooltip((prev) =>
              prev ? { ...prev, x: event.pageX, y: event.pageY } : null
            )
          })
          .on('mouseleave', (event) => {
            d3.select(event.target).attr('opacity', isSelected ? 1 : 0.6).attr('r', radius)
            setEdgeTooltip(null)
          })
          .on('click', () => {
            onSelectEdgeLocation(edgeLoc)
          })
      })
    }

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
  }, [worldData, visiblePartitions, selectedRegion, onSelectRegion, showEdgeLocations, selectedEdgeLocation, onSelectEdgeLocation])

  return (
    <>
      <svg ref={svgRef} className="w-full h-full bg-[#fafafa]" />
      {tooltip && (
        <RegionTooltip
          region={tooltip.region}
          partition={tooltip.partition}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
      {edgeTooltip && (
        <GenericTooltip
          x={edgeTooltip.x}
          y={edgeTooltip.y}
          title={edgeTooltip.edgeLocation.city}
          subtitle={edgeTooltip.edgeLocation.country}
          info={`${edgeTooltip.edgeLocation.count} PoPs`}
          color="#16a34a"
        />
      )}
    </>
  )
}

export type { EdgeLocation }
