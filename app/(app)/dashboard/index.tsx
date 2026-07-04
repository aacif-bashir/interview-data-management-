"use client";

import { useMemo } from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { useTheme } from "next-themes";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import FolderIcon from "@mui/icons-material/Folder";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import FavoriteIcon from "@mui/icons-material/Favorite";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import AddIcon from "@mui/icons-material/Add";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import VideoCallIcon from "@mui/icons-material/VideoCall";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import type { UserRecord, FolderTreeNode } from "@/types";

const weekData = [
  { name: "Mon", completed: 4 },
  { name: "Tue", completed: 7 },
  { name: "Wed", completed: 5 },
  { name: "Thu", completed: 12 },
  { name: "Fri", completed: 8 },
  { name: "Sat", completed: 15 },
  { name: "Sun", completed: 10 },
];

const difficultyData = [
  { name: "Easy", value: 45 },
  { name: "Medium", value: 35 },
  { name: "Hard", value: 20 },
];

export function Dashboard({ user, tree = [] }: { user: UserRecord | null; tree?: FolderTreeNode[] }) {
  const { resolvedTheme } = useTheme();

  // Create a minimal Notion/Linear inspired MUI theme
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: resolvedTheme === "dark" ? "dark" : "light",
          primary: {
            main: resolvedTheme === "dark" ? "#fff" : "#000",
          },
          background: {
            default: "transparent",
            paper: resolvedTheme === "dark" ? "#1A1A1A" : "#FFFFFF",
          },
          text: {
            primary: resolvedTheme === "dark" ? "#EDEDED" : "#111111",
            secondary: resolvedTheme === "dark" ? "#A1A1AA" : "#71717A",
          },
          divider: resolvedTheme === "dark" ? "#333333" : "#EAEAEA",
        },
        typography: {
          fontFamily: "var(--font-sans), sans-serif",
          h4: { fontWeight: 600, letterSpacing: "-0.02em" },
          h6: { fontWeight: 600, letterSpacing: "-0.01em", fontSize: "1.125rem" },
          subtitle2: { fontWeight: 500 },
        },
        shape: {
          borderRadius: 12,
        },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                boxShadow: resolvedTheme === "dark" ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.04)",
                border: `1px solid ${resolvedTheme === "dark" ? "#333" : "#EAEAEA"}`,
                backgroundImage: "none",
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: "none",
                fontWeight: 500,
                borderRadius: 8,
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 6,
              },
            },
          },
        },
      }),
    [resolvedTheme]
  );

  let totalQuestions = 0;
  let totalFolders = 0;

  const countNodes = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      totalFolders++;
      totalQuestions += node.questionCount;
      if (node.children) countNodes(node.children);
    }
  };
  countNodes(tree);

  return (
    <ThemeProvider theme={muiTheme}>
      <Box sx={{ p: { xs: 3, md: 5 }, height: "100%", overflowY: "auto", bgcolor: "transparent" }}>
        {/* Welcome Section */}
        <Box mb={5}>
          <Typography variant="h4" gutterBottom>
            Good Morning, {user?.displayName || "User"}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Let's continue your interview preparation.
          </Typography>
        </Box>

        {/* Search */}
        <Box mb={5}>
          <TextField
            fullWidth
            placeholder="Search folders, questions, answers, tags..."
            variant="outlined"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                sx: { borderRadius: 3, bgcolor: "background.paper" }
              }
            }}
          />
        </Box>

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 5 }}>
          {[
            { title: "Total Questions", value: totalQuestions.toString(), desc: `Across ${totalFolders} folders`, icon: <FolderIcon />, color: "#3B82F6" },
            { title: "Completed", value: "128", desc: "+12 this week", icon: <CheckCircleIcon />, color: "#10B981" },
            { title: "Pending", value: "214", desc: "Needs review", icon: <PendingActionsIcon />, color: "#F59E0B" },
            { title: "Favorites", value: "45", desc: "Bookmarked", icon: <FavoriteIcon />, color: "#EF4444" },
            { title: "Folders", value: totalFolders.toString(), desc: "Topics covered", icon: <FolderIcon />, color: "#8B5CF6" },
            { title: "Study Streak", value: "14", desc: "Days in a row", icon: <LocalFireDepartmentIcon />, color: "#F97316" },
          ].map((stat, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }} key={i}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                    <Box sx={{ color: stat.color, display: "flex", mr: 1.5 }}>{stat.icon}</Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      {stat.title}
                    </Typography>
                  </Box>
                  <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {stat.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Main Content Grid */}
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, lg: 8 }}>
            {/* Study Progress */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Study Progress
                </Typography>
                <Box sx={{ height: 300, mt: 4 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weekData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={resolvedTheme === "dark" ? "#333" : "#eee"} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: resolvedTheme === "dark" ? "#A1A1AA" : "#71717A" }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: resolvedTheme === "dark" ? "#A1A1AA" : "#71717A" }} />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: resolvedTheme === "dark" ? "#1A1A1A" : "#fff",
                          border: `1px solid ${resolvedTheme === "dark" ? "#333" : "#eaeaea"}`,
                          borderRadius: 8,
                        }}
                      />
                      <Line type="monotone" dataKey="completed" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: "#3B82F6" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>

            {/* Today's Goal & Quick Actions */}
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Today's Goal
                    </Typography>
                    <Box sx={{ mt: 3, mb: 4 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Progress</Typography>
                        <Typography variant="body2" fontWeight={600}>6 / 10</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={60} sx={{ height: 8, borderRadius: 4 }} />
                    </Box>
                    <Button variant="contained" fullWidth size="large" disableElevation>
                      Continue Studying
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Quick Actions
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      {[
                        { label: "Add Question", icon: <AddIcon /> },
                        { label: "Mock Interview", icon: <VideoCallIcon /> },
                        { label: "Generate AI", icon: <SmartToyIcon /> },
                        { label: "Analytics", icon: <AnalyticsIcon /> },
                      ].map((action, i) => (
                        <Grid size={{ xs: 6 }} key={i}>
                          <Button 
                            variant="outlined" 
                            fullWidth 
                            startIcon={action.icon}
                            sx={{ justifyContent: "flex-start", py: 1.5, borderColor: "divider", color: "text.primary" }}
                          >
                            {action.label}
                          </Button>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            {/* Upcoming Revisions */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Upcoming Revisions
                </Typography>
                <Box sx={{ mt: 2 }}>
                  {[
                    { q: "Explain React Hooks", date: "Today", status: "High" },
                    { q: "What are Closures?", date: "Tomorrow", status: "Medium" },
                    { q: "System Design: URL Shortener", date: "Tomorrow", status: "High" },
                    { q: "Event Loop in JS", date: "Oct 12", status: "Low" },
                  ].map((item, i) => (
                    <Box key={i} sx={{ py: 1.5, borderBottom: i < 3 ? 1 : 0, borderColor: "divider" }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {item.q}
                      </Typography>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1, alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          {item.date}
                        </Typography>
                        <Chip 
                          label={item.status} 
                          size="small" 
                          color={item.status === "High" ? "error" : item.status === "Medium" ? "warning" : "default"}
                          sx={{ height: 20, fontSize: "0.7rem" }}
                        />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>

            {/* Favorite Topics */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Favorite Topics
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                  {["React", "JavaScript", "Node.js", "Firebase", "Python", "System Design", "TypeScript", "Algorithms"].map((tag) => (
                    <Chip key={tag} label={tag} variant="outlined" sx={{ borderColor: "divider" }} />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}
