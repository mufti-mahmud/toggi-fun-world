import { AmusementPark, LeadEngineer, ParkIssue } from '../types';

export const INITIAL_PARKS: AmusementPark[] = [
  {
    id: 'bashundhara-central',
    name: 'Bashundhara Central Park',
    shortLocation: 'Bashundhara R/A, Dhaka',
    image: '/assets/aistudio/central_park_9c800516.png',
  },
  {
    id: 'toggi-fun-world',
    name: 'Toggi Fun World',
    shortLocation: 'Bashundhara City, Panthapath, Dhaka',
    image: '/assets/aistudio/TOGGI_a4a1824b.JPG',
  },
];

// Clean empty slate as requested: "Remove All Lead Engineers"
export const INITIAL_ENGINEERS: LeadEngineer[] = [];

// Clean empty slate as requested: "Remove all the issues"
export const INITIAL_ISSUES: ParkIssue[] = [];

export const PARK_RIDES: Record<string, string[]> = {
  'bashundhara-central': [
    'Dhaka Eye Giant Ferris Wheel',
    'Roller Coaster',
    'Bumper Cars',
    'Paddle Boating & Lake Cruise',
    'Family Carousel',
    'Mini Express Train',
    'Sky Swinger',
    'Wave Swinger & Pirate Ship',
  ],
  'toggi-fun-world': [
    'VR Theme Coaster & 9D Simulator',
    'Laser Tag Arena',
    'Indoor Drift Bumper Cars',
    'Indoor Drop Tower',
    'Hologram & Arcade Zone',
    'Bowling Alley',
    'Trampoline Park',
    'Soft Play Toddler Jungle',
  ],
};
