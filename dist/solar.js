// NOAA solar-position approximation. Fixed equinox date and local IST times give
// repeatable presentation lighting; architectural shadows use conceptual massing.
const rad=Math.PI/180;
const settings={
 morning:{hour:8,sky:'#e7d4c4',sun:'#ffd6aa',intensity:2.7,ambient:1.55,exposure:1.03,env:.7,background:.74},
 day:{hour:13,sky:'#d6dfdf',sun:'#ffedcf',intensity:3.1,ambient:1.65,exposure:1.05,env:.78,background:.95},
 sunset:{hour:17.75,sky:'#d0a38c',sun:'#ff9e58',intensity:2.8,ambient:1.0,exposure:1.04,env:.46,background:.48},
 evening:{hour:18.9,sky:'#424b65',sun:'#e7c6a0',intensity:.18,ambient:.72,exposure:1.13,env:.27,background:.18},
};
export const lightingModes=Object.keys(settings);
export function lightingAt(mode,site){
 const value=settings[mode]||settings.day;
 const latitude=site.location.lat*rad,longitude=site.location.lon;
 const gamma=2*Math.PI/365*(79-1+(value.hour-12)/24);
 const decl=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
 const eq=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
 const angle=(value.hour*60+eq+4*longitude-330-720)/4*rad;
 const east=-Math.cos(decl)*Math.sin(angle),north=Math.cos(latitude)*Math.sin(decl)-Math.sin(latitude)*Math.cos(decl)*Math.cos(angle);
 const up=Math.sin(latitude)*Math.sin(decl)+Math.cos(latitude)*Math.cos(decl)*Math.cos(angle);
 return {...value,direction:[east*site.eastXZ[0]+north*site.northXZ[0],Math.max(.04,up),east*site.eastXZ[1]+north*site.northXZ[1]]};
}
