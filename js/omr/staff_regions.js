/* soundLAB OMR: port of homr/staff_regions.py (AGPL-3.0, github.com/liebharc/homr).
   Where the staffs above / below a y position start (staff_parsing crops each staff's
   image between its neighbours). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var py = OMR.py;

  // homr: staff_regions.py:4
  function getCenterMinMaxY(staff) { return [staff.minY, staff.maxY]; }

  // homr: staff_regions.py:8
  class StaffRegions {
    constructor(staffs) {
      var centers = [];
      staffs.forEach(function (ms) { ms.staffs.forEach(function (s) { centers.push(getCenterMinMaxY(s)); }); });
      this.centers = centers;
    }
    // homr: staff_regions.py:12
    getStartOfClosestStaffAbove(y) {
      var staffsAbove = this.centers.filter(function (c) { return c[0] < y; }).map(function (c) { return c[1]; });
      if (staffsAbove.length === 0) return 0;
      return py.max(staffsAbove);
    }
    // homr: staff_regions.py:19
    getStartOfClosestStaffBelow(y) {
      var staffsBelow = this.centers.filter(function (c) { return c[1] > y; }).map(function (c) { return c[0]; });
      if (staffsBelow.length === 0) return 1e12; // should be larger than the height of every reasonable image
      return py.min(staffsBelow);
    }
  }

  OMR.staff_regions = { getCenterMinMaxY: getCenterMinMaxY, StaffRegions: StaffRegions };
})(typeof self !== 'undefined' ? self : globalThis);
